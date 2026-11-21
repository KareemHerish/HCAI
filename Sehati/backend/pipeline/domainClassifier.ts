/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';
import { z } from 'zod';
import { ChatTurnHistory, DomainCategory, Language } from '../types';
import {
  GenerateAnswerOptions,
  hasConfiguredGeminiKey,
  invokeGeminiJsonWithFallback,
  LLM_TIMEOUT_LIMITS,
} from './answerGenerator';

export interface ClassificationResult {
  category: DomainCategory;
  triggerType?: string;
  matchedPattern?: string;
  isEgyptConfirmed: boolean;
  countryHint?: 'EG' | 'IQ' | 'SA' | 'AE' | 'JO' | 'KW' | 'OTHER';
  confidence: number;
  classificationSource: 'deterministic_emergency' | 'semantic_llm' | 'heuristic_fallback';
  reason?: string;
  dynamicResponse?: string;
  dynamicFollowUps?: string[];
}

const SemanticClassificationSchema = z.object({
  category: z.enum([
    'GREETING',
    'SAFE_MEDICAL_EDUCATION',
    'PERSONAL_DIAGNOSIS_REQUEST',
    'TREATMENT_REQUEST',
    'MEDICATION_REQUEST',
    'OUT_OF_SCOPE',
    'EMERGENCY',
    'AMBIGUOUS',
  ]),
  reason: z.string(),
  dynamic_response: z.string().optional(),
  is_egypt_mentioned: z.boolean().optional(),
});

const SEMANTIC_SAFETY_CLASSIFIER_PROMPT = `
You are a strict semantic safety and scope classifier for a Medical Education and Health Information chatbot (صحتي / Sehati).

Your task is to evaluate the ACTUAL MEANING, INTENT, AND CONVERSATION CONTEXT of the user's message and classify it into EXACTLY ONE category.

CRITICAL RULES:
- Understand semantic intent regardless of wording, phrasing, statements vs questions, slang, Egyptian Arabic, Modern Standard Arabic, English, or mixed text.
- NEVER rely on hardcoded topic lists or assume a topic is OUT_OF_SCOPE merely because it uses unfamiliar, rare, technical, or specialized medical terminology.
- Read the full intent in context.

CATEGORIES:
1. "GREETING":
   - Pure social greetings, welcomes, pleasantries, compliments, acknowledgements, farewells, or thank-you messages in ANY dialect or phrasing (Egyptian, Gulf, Levantine, Maghrebi, MSA, English, or Franco-Arabic) with NO medical question and NO out-of-scope task.
   - IMPORTANT: If the message combines a greeting WITH a medical question (e.g., "أهلاً، ما هو مرض السكري؟" or "Hi, what is asthma?"), classify it as "SAFE_MEDICAL_EDUCATION", NOT "GREETING".
   - If the message combines a greeting WITH a non-medical task (e.g., "Hi, write Python code"), classify it as "OUT_OF_SCOPE".
   - For "GREETING", write a natural, warm, dialect-aware "dynamic_response" in the Active UI Language matching the EXACT social intent and conversation context:
     * Thanking / praising / appreciating -> reply warmly ("العفو!..." / "You're welcome!...") without re-introducing yourself.
     * Saying goodbye -> wish them good health and invite them back anytime.
     * Acknowledging -> acknowledge warmly and offer help if they have another health question.
     * Greeting at the start of a chat -> return the greeting warmly, briefly introduce yourself as Sehati (صحتي) for medical & health education, and ask how you can help today. If mid-conversation, greet briefly without re-introducing yourself.

2. "EMERGENCY":
   - Describes active or acute life-threatening symptoms, urgent medical emergencies, severe chest pain/heart attack signs, inability to breathe/choking, stroke signs (facial droop, slurred speech, sudden weakness), unconsciousness, anaphylaxis, severe uncontrolled bleeding, poisoning/overdose, or self-harm/suicide intent.

3. "PERSONAL_DIAGNOSIS_REQUEST":
   - Asks to diagnose a person ("do I have...", "what's wrong with me", "could my symptoms mean...", "tell me what illness this is").
   - Presents personal symptoms, personal vital measurements, lab test results, or imaging findings asking what disease they indicate or for personal risk assessment / medical triage.
   - Write "dynamic_response" in the Active UI Language tailored directly to what the user asked about (never a generic copy-paste template): politely explain you cannot diagnose their specific symptom/test/case because diagnosis requires a licensed doctor.

4. "TREATMENT_REQUEST":
   - Asks how to treat, cure, heal, or manage a condition for oneself or another person, or requests a treatment plan, recovery plan, surgical choice, or home remedies/herbs/diets intended to treat or cure an illness.
   - Note: Conceptual educational questions like "What is physical therapy?" or "What is dialysis as a medical concept?" remain SAFE_MEDICAL_EDUCATION.
   - Write "dynamic_response" in the Active UI Language tailored specifically to their condition/remedy question: politely explain you cannot provide or recommend a personal treatment plan for that case because a doctor must decide based on personal evaluation.

5. "MEDICATION_REQUEST":
   - Asks which medication, antibiotic, painkiller, supplement, or drug to take; asks for medication dosages ("how many pills/mg"); or asks whether to start, stop, switch, adjust, or combine medications.
   - Note: Conceptual educational questions about what a drug class or biological substance is (e.g., "What is insulin?", "How do vaccines work?", "What does antibiotic resistance mean?") are SAFE_MEDICAL_EDUCATION.
   - Write "dynamic_response" in the Active UI Language tailored specifically to the medication/symptom they mentioned: politely explain you cannot prescribe, recommend a drug, or set doses for that case because a doctor or pharmacist must advise.

6. "OUT_OF_SCOPE":
   - Requests or topics genuinely outside human health and medical education. Evaluate semantically based on the meaning of the prompt itself.
   - For "OUT_OF_SCOPE", you MUST write "dynamic_response" in the Active UI Language tailored directly to the user's specific request: politely state that doing or answering *that specific request* is not part of your role/mission because you are specialized in general medical and health education only, and invite them to ask a health or medical question instead. Never use a generic copy-paste template that ignores what the user asked.

7. "AMBIGUOUS":
   - Unintelligible/garbled text, incomplete or underspecified messages, bare single-word topics with no clear question (e.g., "الضغط", "السكر", "الصداع" alone without asking a question), vague complaints ("help", "pain", "sick", "تعبان", "مريض", "عندي سؤال"), or unclear references ("لماذا هذا", "ليه كده", "هو ده طبيعي؟", "مش فاهم") with no clear medical question even when considering conversation history.
   - STRICT NO-GUESSING RULE: Never guess what the user meant or answer a guessed question. Write "dynamic_response" in the Active UI Language addressing the exact words the user wrote and asking 1-2 short, focused clarifying questions to understand their complete question before answering. Never output a canned generic template.
   - MULTI-TURN CONTINUATION: If the previous assistant turn asked for clarification, combine the user's prior unclear message with their new clarification reply to classify the COMPLETE intent accurately (into EMERGENCY, PERSONAL_DIAGNOSIS_REQUEST, TREATMENT_REQUEST, MEDICATION_REQUEST, OUT_OF_SCOPE, SAFE_MEDICAL_EDUCATION, or AMBIGUOUS if still unclear).

8. "SAFE_MEDICAL_EDUCATION":
   - Any clear, legitimate question or statement seeking general medical or health education: definitions, disease overviews, rare or common conditions, anatomy, physiology, how organs/systems work, general causes, general risk factors, general recognized symptoms of a condition, medical terminology, what a diagnostic test measures in general, disease classifications, prevention, nutrition science, mental health education, or public health concepts.
   - Includes context-dependent educational follow-ups (e.g. "What causes it?", "Are there different types?", "ما هي مضاعفاته؟") or user clarifications following a clarification prompt when conversation history establishes a clear medical topic.
`.trim();

const NOT_EGYPT_PATTERNS = [
  /مش من مصر/,
  /مش في مصر/,
  /لست من مصر/,
  /لست في مصر/,
  /غير مصري/,
  /خارج مصر/,
  /\bnot\s+(?:from|in)\s+egypt\b/i,
  /\boutside\s+egypt\b/i,
];

const COUNTRY_MATCHERS: Array<{ code: 'IQ' | 'SA' | 'AE' | 'JO' | 'KW'; patterns: RegExp[] }> = [
  { code: 'IQ', patterns: [/\biraq\b/i, /\bbaghdad\b/i, /العراق/, /عراقي/, /بغداد/, /البصرة/, /أربيل|اربيل/] },
  { code: 'SA', patterns: [/\bsaudi\b/i, /\bksa\b/i, /\briyadh\b/i, /\bjeddah\b/i, /السعودية|السعوديه|سعودي/, /الرياض/, /جدة|جده/, /الدمام/, /مكة|مكه/] },
  { code: 'AE', patterns: [/\buae\b/i, /\bdubai\b/i, /\babu\s*dhabi\b/i, /الامارات|الإمارات|اماراتي/, /دبي/, /ابوظبي|أبوظبي/] },
  { code: 'JO', patterns: [/\bjordan\b/i, /\bamman\b/i, /الاردن|الأردن|اردني/, /عمّان|عمان/] },
  { code: 'KW', patterns: [/\bkuwait\b/i, /الكويت|كويتي/] },
];

const EGYPT_PATTERNS = [
  /\begypt\b/i,
  /\bcairo\b/i,
  /\balexandria\b/i,
  /\bgiza\b/i,
  /مصر/,
  /القاهرة/,
  /الاسكندرية|الإسكندرية/,
  /الجيزة/,
  /في مصر/,
  /انا من مصر|أنا من مصر/,
];

const EMERGENCY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(وجع|ألم|الم|كتمة|عاصر|ضغط|حرقان شديد).{0,25}(صدر|صدري|القلب)/i, label: 'Severe Chest Pain (AR)' },
  { pattern: /(أزمة قلبية|ازمة قلبية|ذبحة صدرية|نوبة قلبية)/i, label: 'Heart Attack Warning (AR)' },
  { pattern: /\b(severe\s+)?chest\s*(pain|pressure|tightness|crushing)\b/i, label: 'Severe Chest Pain (EN)' },
  { pattern: /\bheart\s*attack\b/i, label: 'Heart Attack Warning (EN)' },
  { pattern: /(مش قادر اتنفس|مش عارف اتنفس|لا أستطيع التنفس|صعوبة شديدة في التنفس|ضيق تنفس شديد|ضيق في التنفس|مخنوق|نفسي مقطوع|اختناق|شرخ.{0,20}(القصبه|القصبة)|ثقب.{0,20}(القصبه|القصبة)|انسداد مجرى الهواء)/i, label: 'Severe Breathing / Airway Emergency (AR)' },
  { pattern: /(حالة حرجة|حالة خطيرة|حاله حرجه|حاله خطيره|في خطر شديد).{0,40}(تنفس|قصبة|قصبه|قلب|نزيف|وعي|حرق|كسر|صدمة|حادث|تسمم)/i, label: 'Critical Medical Emergency (AR)' },
  { pattern: /\b(can'?t|cannot|unable to|hard to|difficulty|trouble|shortness of)\s*breath(e|ing)?\b/i, label: 'Severe Breathing Difficulty (EN)' },
  { pattern: /\b(choking|suffocating|respiratory distress|trachea(l)?\s*(tear|rupture|fracture|injury)|airway obstruction)\b/i, label: 'Choking / Airway Emergency (EN)' },
  { pattern: /(شلل في الوش|شلل نصفي|ثقل في اللسان|تقل في اللسان|اعوجاج الفم|تنميل مفاجئ|فقدان النطق|جلطة في المخ|جلطة دماغية|سكتة دماغية)/i, label: 'Stroke Warning Signs (AR)' },
  { pattern: /\b(stroke|facial droop|face droop|slurred speech|sudden numbness|arm weakness)\b/i, label: 'Stroke Warning Signs (EN)' },
  { pattern: /(فقدان الوعي|فقدت الوعي|فقد وعيه|اغمى عليا|أغمى عليا|أغمي عليه|إغماء مفاجئ|غيبوبة|مش بيرد|فاقد الوعي)/i, label: 'Unconsciousness (AR)' },
  { pattern: /\b(unconscious|passed out|loss of consciousness|unresponsive|coma)\b/i, label: 'Unconsciousness (EN)' },
  { pattern: /(تورم اللسان|تورم الحلق|ورم في الحلق|صدمة تحسسية|حساسية شديدة تهدد التنفس)/i, label: 'Severe Allergic Reaction (AR)' },
  { pattern: /\b(anaphylaxis|severe allergic reaction|throat swelling|tongue swelling)\b/i, label: 'Severe Allergic Reaction (EN)' },
  { pattern: /(نزيف شديد|نزيف حاد|نزيف جامد|نزيف داخلي|دم مش بيقف|نزيف مستمر|تسمم حاد|بلع سم)/i, label: 'Serious Bleeding / Poisoning (AR)' },
  { pattern: /\b(severe|heavy|uncontrolled|serious|internal)\s*bleeding\b/i, label: 'Serious Bleeding (EN)' },
  { pattern: /(عايز انتحر|أنتحر|انتحر|انتحار|اموت نفسي|أقتل نفسي|اقتل نفسي|إنهاء حياتي|أذية نفسي|اذية نفسي)/i, label: 'Immediate Self-Harm Risk (AR)' },
  { pattern: /\b(suicide|kill myself|harm myself|end my life|self[- ]harm|want to die)\b/i, label: 'Immediate Self-Harm Risk (EN)' },
];

const MEDICATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(جرعة|جرعات|كم حبة|كام حبة|كم قرص|كام قرص|كم كبسولة|كام كبسولة|كم مل|كام مل|كم مللي|كام مللي|كم نقطة|كام نقطة|كام وحدة|كم وحدة)/i, label: 'Dosage Request (AR)' },
  { pattern: /(اخد دواء ايه|آخد دواء إيه|اخد علاج ايه|آخد علاج إيه|أخد إيه لل|ايه احسن دواء|ما هو أفضل دواء|اكتبلي دواء|اوصفلي دواء|رشحلي دواء|مضاد حيوي مناسب|مسكن مناسب)/i, label: 'Medication Recommendation (AR)' },
  { pattern: /(ينفع اخلط|خلط الأدوية|تعارض دوائي لي|هل أوقف دواء|أوقف الدواء|اغير الدواء|بديل دواء لي|أبدأ دواء)/i, label: 'Drug Combination / Regimen Change (AR)' },
  { pattern: /\b(how many (pills|tablets|capsules|drops|mg|ml|units)|what dose|what dosage|dosage of|dose of|calculate.*dose|adjust.*dose)\b/i, label: 'Dosage Request (EN)' },
  { pattern: /\b(which|what)\s+(medicine|medication|drug|antibiotic|painkiller|insulin|pill|tablet)s?\s+(should i|can i|to)\s+(take|use)\b/i, label: 'Medication Recommendation (EN)' },
  { pattern: /\b(recommend|prescribe|suggest)\s+(a\s+|some\s+)?(medicine|medication|drug|pill|antibiotic|painkiller|steroid)\b/i, label: 'Medication Prescription Request (EN)' },
  { pattern: /\b(combine|mix)\s+.*\b(medications?|drugs?|pills?|ibuprofen|aspirin|paracetamol|tylenol)\b/i, label: 'Drug Combination Query (EN)' },
  { pattern: /\b(can i|should i)\s+(stop|start|replace|switch|change|increase|decrease)\s+.*(medication|medicine|drug|pills?|insulin|dose)\b/i, label: 'Medication Modification Request (EN)' },
];

const TREATMENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(كيف أعالج|ازاي اعالج|إزاي أعالج|علاج حالتي|خطة علاج|علاج سريع ل|علاج منزلي|وصفة منزلية|(أعشاب|اعشاب|مشروبات|وصفات)\s*(اللي\s*)?(تعالج|تشفي|لعلاج)|طريقة علاج|اعمل ايه عشان اخف|اتعالج ازاي)/i, label: 'Treatment Request (AR)' },
  { pattern: /(تعديل نمط الحياة لعلاج|أفضل علاج لي|أختار أي عملية|هل أحتاج عملية)/i, label: 'Personalized Treatment / Procedure Request (AR)' },
  { pattern: /\b(how (do|can|should) i (treat|cure|heal|manage|fix)|treatment plan for my|best treatment for (my|me)|home remed(y|ies) (to treat|to cure|for my))\b/i, label: 'Treatment Plan / Home Remedy Request (EN)' },
  { pattern: /\b(how to treat|cure my|treat my|manage my)\b/i, label: 'Personal Disease Management Request (EN)' },
  { pattern: /\b(do i need surgery|should i get surgery|which procedure should i|rehabilitation plan for me|recovery plan for me)\b/i, label: 'Personalized Intervention Request (EN)' },
  { pattern: /\b(recommend|suggest)\s+(a\s+)?(treatment|therapy|remedy|diet to cure)\b/i, label: 'Treatment Recommendation Request (EN)' },
];

const PERSONAL_DIAGNOSIS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(شخصني|شخص لي|شخصلي|شخص مرضي|هل (أنا |انا )?(مصاب|عندي)|أنا عندي إيه|انا عندي ايه|عندي ايه|عندي إيه|مرضي ايه|تفتكر عندي|احتمال يكون عندي|ماذا أعاني)/i, label: 'Personal Diagnosis Request (AR)' },
  { pattern: /(هل .{0,40}(اللي عندي|عندي|أعاني منها) .{0,25}(معناه|يعني|يدل)|الأعراض اللي عندي دي|تحليلي طلع|نتيجة التحليل بتاعتي|اقرالي (نتيجة )?التحليل|تفسير (نتيجة )?تحليلي|هل أروح لدكتور ولا لأ)/i, label: 'Personal Symptom / Lab Interpretation (AR)' },
  { pattern: /\b(diagnose me|what disease do i have|what condition do i have|do i have|could i have|am i suffering from|what is wrong with me)\b/i, label: 'Personal Diagnosis Request (EN)' },
  { pattern: /\b(based on (my|these) symptoms|does my .* mean i have|interpret my (lab |blood |medical )*(test )?results?|what do my (lab |blood )*(test )?results mean)\b/i, label: 'Personal Symptom / Test Interpretation (EN)' },
  { pattern: /\b(assess my (risk|health|condition)|evaluate my symptoms|differential diagnosis for my|triage my)\b/i, label: 'Personal Risk / Clinical Assessment (EN)' },
];

const SOCIAL_TOKEN_PATTERN =
  /^(?:(?:hi|hello|hey|good morning|good afternoon|good evening|good night|how are you|how's it going|what's up|sup|thanks a lot|thank you so much|thank you|thanks|thx|ty|appreciate it|bye|goodbye|see you|see ya|take care|ok|okay|got it|understood|great|cool|nice|awesome|alright|fine|sounds good|اهلا وسهلا بيك|أهلا وسهلا بيك|اهلا وسهلا بك|أهلا وسهلا بك|اهلا وسهلا|أهلا وسهلا|أهلاً وسهلاً|اهلا بيك|أهلا بيك|اهلا بك|أهلا بك|اهلا|أهلا|أهلاً|اهلين|أهلين|هلا|يا هلا|هاي|الو|ألو|مرحبا|مرحباً|السلام عليكم ورحمة الله وبركاته|السلام عليكم ورحمة الله|السلام عليكم|وعليكم السلام|سلام عليكم|السلام|سلام|ازيك|إزيك|ازيكو|إزيكو|ازي حضرتك|إزي حضرتك|كيف حالك|عامل ايه|عامل إيه|عاملة ايه|عاملة إيه|اخبارك ايه|أخبارك إيه|اخبارك|أخبارك|صباح الخير|صباح النور|صباح الفل|مساء الخير|مساء النور|مساء الفل|شكرا جزيلا|شكراً جزيلاً|شكرا جدا|شكراً جداً|شكرا لك|شكراً لك|شكرا ليك|شكراً ليك|الف شكر|ألف شكر|شكرا|شكراً|متشكر جدا|متشكر جداً|متشكر|متشكرة|متشكره|مشكور|مشكورة|تسلم ايدك|تسلم إيدك|تسلملي|تسلمي|تسلم|يعطيك العافية|يعطيك العافيه|ربنا يخليك|الله يبارك فيك|جزاك الله خيرا|جزاك الله خيراً|ميرسي|مرسي|مع السلامة|مع السلامه|اشوفك على خير|أشوفك على خير|تصبح على خير|في امان الله|في أمان الله|باي باي|باي|تمام جدا|تمام جداً|تمام|ماشي|حاضر|طيب|فهمت|وضحت|ممتاز|حلو|جميل|رائع|عظيم|اوكي|أوكي|اوكيه|اوك|تشرفنا|يا صحتي|صحتي|يا باشا|يا فندم|يا دكتور|حبيبي|الله يسلمك|العفو)[!?.،؟,\s]*)+$/i;

const THANKS_INTENT_RE =
  /(شكرا|شكراً|متشكر|متشكرة|متشكره|مشكور|مشكورة|تسلم|يعطيك العاف|ربنا يخليك|الله يبارك فيك|جزاك الله|ميرسي|مرسي|الف شكر|ألف شكر|\bthanks\b|\bthank you\b|\bthx\b|\bty\b|\bappreciate it\b)/i;

const FAREWELL_INTENT_RE =
  /(مع السلامة|مع السلامه|اشوفك على خير|أشوفك على خير|تصبح على خير|في امان الله|في أمان الله|باي|\bbye\b|\bgoodbye\b|\bsee you\b|\bsee ya\b|\btake care\b|\bgood night\b)/i;

const HOW_ARE_YOU_INTENT_RE =
  /(ازيك|إزيك|ازيكو|إزيكو|ازي حضرتك|إزي حضرتك|كيف حالك|عامل ايه|عامل إيه|عاملة ايه|عاملة إيه|اخبارك|أخبارك|\bhow are you\b|\bhow's it going\b|\bwhat's up\b|\bsup\b)/i;

const MORNING_INTENT_RE = /(صباح الخير|صباح النور|صباح الفل|\bgood morning\b)/i;
const EVENING_INTENT_RE = /(مساء الخير|مساء النور|مساء الفل|\bgood evening\b|\bgood afternoon\b)/i;

const PURE_ACK_INTENT_RE =
  /(تمام|ماشي|حاضر|طيب|فهمت|وضحت|ممتاز|حلو|جميل|رائع|عظيم|اوكي|أوكي|اوكيه|اوك|\bok\b|\bokay\b|\bgot it\b|\bunderstood\b|\bgreat\b|\bcool\b|\bnice\b|\bawesome\b|\balright\b|\bfine\b|\bsounds good\b)/i;

const GREETING_OPENING_RE =
  /(اهلا|أهلا|أهلاً|اهلين|أهلين|هلا|هاي|الو|ألو|مرحبا|مرحباً|السلام|سلام|\bhi\b|\bhello\b|\bhey\b)/i;

function buildSocialClassification(
  text: string,
  history: ChatTurnHistory[],
  uiLang: Language,
  isEgyptConfirmed: boolean
): ClassificationResult | null {
  if (!SOCIAL_TOKEN_PATTERN.test(text)) return null;

  const isAr = uiLang !== 'en';
  const hasHistory = history.length > 0;
  const hasThanks = THANKS_INTENT_RE.test(text);
  const hasFarewell = FAREWELL_INTENT_RE.test(text);
  const hasHowAreYou = HOW_ARE_YOU_INTENT_RE.test(text);
  const hasMorning = MORNING_INTENT_RE.test(text);
  const hasEvening = EVENING_INTENT_RE.test(text);
  const hasAck = PURE_ACK_INTENT_RE.test(text);
  const hasGreetingOpening = GREETING_OPENING_RE.test(text);

  if (hasThanks && hasFarewell) {
    return {
      category: 'GREETING',
      triggerType: 'User Thanks & Farewell',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User thanked the assistant and said goodbye.',
      dynamicResponse: isAr
        ? 'العفو، ومع ألف سلامة! أتمنى لك دوام الصحة والعافية، ويمكنك العودة في أي وقت إذا كان لديك أي سؤال طبي أو صحي آخر.'
        : "You're very welcome, and take care! Wishing you good health—feel free to come back anytime you have another health question.",
    };
  }

  if (hasThanks) {
    return {
      category: 'GREETING',
      triggerType: 'User Thanks / Appreciation',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User expressed gratitude or thanks.',
      dynamicResponse: isAr
        ? 'العفو! يسعدني دائماً مساعدتك. إذا كان لديك أي سؤال صحي أو طبي آخر في أي وقت، تفضل بطرحه.'
        : "You're very welcome! I'm always glad to help. Feel free to ask if you have any other health or medical education questions.",
    };
  }

  if (hasFarewell) {
    return {
      category: 'GREETING',
      triggerType: 'User Farewell',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User said goodbye.',
      dynamicResponse: isAr
        ? 'مع السلامة! أتمنى لك دوام الصحة والعافية، وأنا هنا دائماً متى احتجت لأي معلومة طبية أو صحية عامة.'
        : 'Goodbye and take care! Wishing you good health—come back anytime you need general health or medical information.',
    };
  }

  if (hasHowAreYou) {
    return {
      category: 'GREETING',
      triggerType: 'User Check-In Greeting',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User asked how the assistant is doing.',
      dynamicResponse: isAr
        ? hasHistory
          ? 'الحمد لله بخير، شكراً لسؤالك! هل هناك أي سؤال طبي أو صحي آخر تود أن أساعدك فيه؟'
          : 'الحمد لله بخير! أنا صحتي، مساعدك للمعلومات الطبية والتثقيف الصحي العام. كيف يمكنني مساعدتك اليوم؟'
        : hasHistory
        ? "I'm doing great, thanks for asking! Is there another health or medical question I can help you with?"
        : "I'm doing great, thanks for asking! I'm Sehati, your general medical and health education assistant. How can I help you today?",
    };
  }

  if (hasMorning) {
    return {
      category: 'GREETING',
      triggerType: 'Morning Greeting',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User sent a morning greeting.',
      dynamicResponse: isAr
        ? hasHistory
          ? 'صباح النور! كيف يمكنني مساعدتك الآن؟'
          : 'صباح النور! أهلاً بك في صحتي، مساعدك للمعلومات الطبية والتثقيف الصحي العام. كيف يمكنني مساعدتك اليوم؟'
        : hasHistory
        ? 'Good morning! How can I help you right now?'
        : "Good morning! Welcome to Sehati, your general medical and health education assistant. How can I help you today?",
    };
  }

  if (hasEvening) {
    return {
      category: 'GREETING',
      triggerType: 'Evening Greeting',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User sent an evening/afternoon greeting.',
      dynamicResponse: isAr
        ? hasHistory
          ? 'مساء النور! كيف يمكنني مساعدتك الآن؟'
          : 'مساء النور! أهلاً بك في صحتي، مساعدك للمعلومات الطبية والتثقيف الصحي العام. كيف يمكنني مساعدتك اليوم؟'
        : hasHistory
        ? 'Good evening! How can I help you right now?'
        : "Good evening! Welcome to Sehati, your general medical and health education assistant. How can I help you today?",
    };
  }

  if (hasAck && !hasGreetingOpening) {
    return {
      category: 'GREETING',
      triggerType: 'User Acknowledgement',
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'heuristic_fallback',
      reason: 'User acknowledged the previous response.',
      dynamicResponse: isAr
        ? 'رائع! إذا احتجت توضيحاً إضافياً أو كان لديك أي سؤال طبي أو صحي آخر، تفضل بطرحه في أي وقت.'
        : 'Great! If you need any further explanation or have another medical or health question, feel free to ask anytime.',
    };
  }

  // Standard opening greeting
  return {
    category: 'GREETING',
    triggerType: 'Pure Social Greeting',
    isEgyptConfirmed,
    confidence: 0.99,
    classificationSource: 'heuristic_fallback',
    reason: 'Pure social greeting or pleasantry.',
    dynamicResponse: hasHistory
      ? isAr
        ? 'أهلاً بك من جديد! كيف يمكنني مساعدتك الآن؟'
        : 'Hello again! How can I help you right now?'
      : undefined,
  };
}

function checkEgyptConfirmed(text: string, history: ChatTurnHistory[]): boolean {
  const turns = [
    ...history.slice(-20).filter((t) => t.role === 'user').map((t) => t.text),
    text,
  ];
  let confirmed: boolean | null = null;
  for (const t of turns) {
    if (
      NOT_EGYPT_PATTERNS.some((re) => re.test(t)) ||
      COUNTRY_MATCHERS.some((c) => c.patterns.some((re) => re.test(t)))
    ) {
      confirmed = false;
    } else if (EGYPT_PATTERNS.some((re) => re.test(t))) {
      confirmed = true;
    }
  }
  return Boolean(confirmed);
}

function detectCountryHint(
  text: string,
  history: ChatTurnHistory[]
): 'EG' | 'IQ' | 'SA' | 'AE' | 'JO' | 'KW' | 'OTHER' {
  const turns = [
    ...history.slice(-20).filter((t) => t.role === 'user').map((t) => t.text),
    text,
  ];
  let hint: 'EG' | 'IQ' | 'SA' | 'AE' | 'JO' | 'KW' | 'OTHER' = 'OTHER';
  for (const t of turns) {
    const matchedCountry = COUNTRY_MATCHERS.find((c) => c.patterns.some((re) => re.test(t)));
    if (matchedCountry) {
      hint = matchedCountry.code;
    } else if (NOT_EGYPT_PATTERNS.some((re) => re.test(t))) {
      hint = 'OTHER';
    } else if (EGYPT_PATTERNS.some((re) => re.test(t))) {
      hint = 'EG';
    }
  }
  return hint;
}

export function detectQueryLanguage(text: string): 'ar' | 'en' | 'mixed' {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);
  if (hasArabic && hasEnglish) return 'mixed';
  if (hasArabic) return 'ar';
  return 'en';
}

export function checkImmediateEmergency(
  rawQuery: string,
  history: ChatTurnHistory[] = []
): ClassificationResult | null {
  const text = (rawQuery || '').trim();
  const isEgyptConfirmed = checkEgyptConfirmed(text, history);
  const countryHint = detectCountryHint(text, history);

  for (const item of EMERGENCY_PATTERNS) {
    if (item.pattern.test(text)) {
      return {
        category: 'EMERGENCY',
        triggerType: item.label,
        matchedPattern: item.pattern.source,
        isEgyptConfirmed,
        countryHint,
        confidence: 0.99,
        classificationSource: 'deterministic_emergency',
      };
    }
  }

  // If the immediately preceding assistant response was an active emergency alert
  // and the user just clarified their country (e.g. "انا من السعوديه" / "انا من العراق"),
  // keep the emergency alert active and localized to THAT country instead of forgetting!
  const prevTurn = history.length > 0 ? history[history.length - 1] : null;
  const prevWasEmergency =
    prevTurn?.role === 'model' && /تنبيه طوارئ فوري|Immediate Emergency Alert/i.test(prevTurn.text);
  const mentionsCountryNow =
    COUNTRY_MATCHERS.some((c) => c.patterns.some((re) => re.test(text))) ||
    EGYPT_PATTERNS.some((re) => re.test(text)) ||
    NOT_EGYPT_PATTERNS.some((re) => re.test(text));

  if (prevWasEmergency && mentionsCountryNow && text.length <= 60) {
    return {
      category: 'EMERGENCY',
      triggerType: 'Emergency Country Follow-up',
      isEgyptConfirmed,
      countryHint,
      confidence: 0.99,
      classificationSource: 'deterministic_emergency',
    };
  }

  return null;
}

export function checkImmediateGreeting(
  rawQuery: string,
  history: ChatTurnHistory[] = [],
  uiLang: Language = 'ar'
): ClassificationResult | null {
  const text = (rawQuery || '').trim();
  if (!text) return null;
  return buildSocialClassification(text, history, uiLang, false);
}

/**
 * Fallback heuristic classifier (used for offline unit testing or when LLM key is absent).
 * Never hardcodes out-of-scope topic lists; out-of-scope distinction is evaluated by the semantic LLM.
 */
export function classifyDomainHeuristic(
  rawQuery: string,
  history: ChatTurnHistory[] = [],
  _uiLang: Language = 'ar'
): ClassificationResult {
  const text = (rawQuery || '').trim();
  const isEgyptConfirmed = checkEgyptConfirmed(text, history);

  const immediateEmergency = checkImmediateEmergency(text, history);
  if (immediateEmergency) return immediateEmergency;

  for (const item of MEDICATION_PATTERNS) {
    if (item.pattern.test(text)) {
      return {
        category: 'MEDICATION_REQUEST',
        triggerType: item.label,
        matchedPattern: item.pattern.source,
        isEgyptConfirmed,
        confidence: 0.95,
        classificationSource: 'heuristic_fallback',
      };
    }
  }

  for (const item of PERSONAL_DIAGNOSIS_PATTERNS) {
    if (item.pattern.test(text)) {
      return {
        category: 'PERSONAL_DIAGNOSIS_REQUEST',
        triggerType: item.label,
        matchedPattern: item.pattern.source,
        isEgyptConfirmed,
        confidence: 0.95,
        classificationSource: 'heuristic_fallback',
      };
    }
  }

  for (const item of TREATMENT_PATTERNS) {
    if (item.pattern.test(text)) {
      return {
        category: 'TREATMENT_REQUEST',
        triggerType: item.label,
        matchedPattern: item.pattern.source,
        isEgyptConfirmed,
        confidence: 0.94,
        classificationSource: 'heuristic_fallback',
      };
    }
  }

  const socialMatch = buildSocialClassification(text, history, _uiLang, isEgyptConfirmed);
  if (socialMatch) {
    return socialMatch;
  }

  const isAmbiguousSymptomOnly =
    /^(pain|sick|hurt|hurts|help|tired|weak|تعب|تعبان|مريض|وجع|ألم|الم|مساعدة|ساعدني)[!?.،؟\s]*$/i.test(
      text
    );

  if (!text || isAmbiguousSymptomOnly) {
    return {
      category: 'AMBIGUOUS',
      triggerType: 'Vague / Ambiguous Request',
      isEgyptConfirmed,
      confidence: 0.88,
      classificationSource: 'heuristic_fallback',
    };
  }

  return {
    category: 'SAFE_MEDICAL_EDUCATION',
    isEgyptConfirmed,
    confidence: 0.85,
    classificationSource: 'heuristic_fallback',
  };
}

// Backward-compatible export name
export const classifyDomain = classifyDomainHeuristic;

export interface SemanticClassifierOptions extends GenerateAnswerOptions {
  mockCategory?: DomainCategory;
}

/**
 * Universal Semantic Safety Filter Classifier:
 * Evaluates actual meaning, intent, and conversation history for EVERY user prompt
 * using Gemini structured JSON without hardcoded out-of-scope topic lists.
 */
export async function classifyDomainSemantic(
  rawQuery: string,
  history: ChatTurnHistory[] = [],
  uiLang: Language = 'ar',
  options: SemanticClassifierOptions = {}
): Promise<ClassificationResult> {
  const text = (rawQuery || '').trim();
  const isEgyptConfirmed = checkEgyptConfirmed(text, history);

  // 1. Instant deterministic emergency check (zero latency for obvious life-threatening signs)
  const immediateEmergency = checkImmediateEmergency(text, history);
  if (immediateEmergency) {
    return immediateEmergency;
  }

  if (!text) {
    return {
      category: 'AMBIGUOUS',
      triggerType: 'Empty Query',
      isEgyptConfirmed,
      confidence: 1,
      classificationSource: 'heuristic_fallback',
    };
  }

  if (options.mockCategory) {
    return {
      category: options.mockCategory,
      triggerType: options.mockCategory,
      isEgyptConfirmed,
      confidence: 0.99,
      classificationSource: 'semantic_llm',
    };
  }

  // In offline CLI tests without GEMINI_API_KEY and without mock invokeModel, use heuristic fallback
  if (!options._testOverrides?.invokeModel && !hasConfiguredGeminiKey()) {
    return classifyDomainHeuristic(text, history, uiLang);
  }

  const recentHistory = history
    .slice(-20)
    .map((h) => `${h.role === 'user' ? 'USER' : 'ASSISTANT'}: ${h.text.slice(0, 450)}`)
    .join('\n');

  const classifierContents = `${
    recentHistory
      ? `[RECENT_CONVERSATION_HISTORY]\n${recentHistory}\n\n`
      : '[RECENT_CONVERSATION_HISTORY]\n(None)\n\n'
  }[USER_MESSAGE_TO_CLASSIFY]
Message: """${text}"""
Active UI Language: ${uiLang}

Classify the intent and scope of USER_MESSAGE_TO_CLASSIFY strictly based on its semantic meaning and context. If GREETING or OUT_OF_SCOPE, also produce a natural, helpful "dynamic_response" in ${uiLang === 'ar' ? 'Arabic' : 'English'}.`;

  try {
    const classifierOptions: GenerateAnswerOptions = {
      ...options,
      _testOverrides: {
        ...options._testOverrides,
        candidateModels: options._testOverrides?.candidateModels ?? [
          'gemini-3.1-flash-lite',
          'gemini-4-hydrogen',
        ],
      },
    };

    const { parsed } = await invokeGeminiJsonWithFallback({
      contents: classifierContents,
      baseConfig: {
        systemInstruction: SEMANTIC_SAFETY_CLASSIFIER_PROMPT,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: [
                'GREETING',
                'SAFE_MEDICAL_EDUCATION',
                'PERSONAL_DIAGNOSIS_REQUEST',
                'TREATMENT_REQUEST',
                'MEDICATION_REQUEST',
                'OUT_OF_SCOPE',
                'EMERGENCY',
                'AMBIGUOUS',
              ],
            },
            reason: {
              type: Type.STRING,
              description: 'Brief 1-sentence reason for this semantic classification.',
            },
            dynamic_response: {
              type: Type.STRING,
              description:
                'Required for GREETING, OUT_OF_SCOPE, PERSONAL_DIAGNOSIS_REQUEST, TREATMENT_REQUEST, MEDICATION_REQUEST, and AMBIGUOUS. Write a natural, respectful reply directly tailored to the user message without generic canned wording. Written in Active UI Language.',
            },
            is_egypt_mentioned: {
              type: Type.BOOLEAN,
              description: 'True if user message or history indicates user is located in Egypt.',
            },
          },
          required: ['category', 'reason'],
        },
      },
      schema: SemanticClassificationSchema,
      options: classifierOptions,
      defaultPrimaryTimeoutMs: LLM_TIMEOUT_LIMITS.CLASSIFIER_PRIMARY_TIMEOUT_MS,
      defaultFallbackTimeoutMs: LLM_TIMEOUT_LIMITS.CLASSIFIER_FALLBACK_TIMEOUT_MS,
      label: 'SemanticSafetyClassifier',
    });

    return {
      category: parsed.category,
      triggerType: parsed.reason,
      reason: parsed.reason,
      dynamicResponse: parsed.dynamic_response?.trim() || undefined,
      isEgyptConfirmed: isEgyptConfirmed || Boolean(parsed.is_egypt_mentioned),
      confidence: 0.97,
      classificationSource: 'semantic_llm',
    };
  } catch (err) {
    // Only fall back to deterministic safety prohibitions / greeting if semantic LLM errored
    const heuristic = classifyDomainHeuristic(text, history, uiLang);
    if (heuristic.category !== 'SAFE_MEDICAL_EDUCATION') {
      return heuristic;
    }
    throw err;
  }
}
