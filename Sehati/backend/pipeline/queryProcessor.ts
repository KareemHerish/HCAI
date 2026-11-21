/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatTurnHistory, Language, ProcessedQuery } from '../types.js';
import { detectQueryLanguage } from './domainClassifier.js';

// Bilingual Egyptian Arabic / MSA <-> English medical terminology expansion dictionary
// Used ONLY for query normalization and cross-lingual retrieval matching (never alters medical intent)
const MEDICAL_SYNONYM_MAP: Array<{ patterns: RegExp[]; expansions: string[]; topicTag: string }> = [
  {
    patterns: [/سكر|السكري|داء السكر|جلوكوز|انسولين|أنسولين|\bdiabetes\b|\bdiabetic\b|\ba1c\b|\binsulin\b|\bglucose\b/i],
    expansions: ['diabetes', 'diabetes mellitus', 'blood glucose', 'insulin', 'السكري', 'مرض السكر', 'الجلوكوز'],
    topicTag: 'diabetes',
  },
  {
    patterns: [/ضغط الدم|الضغط العالي|ارتفاع الضغط|الضغط|\bhypertension\b|\bhigh blood pressure\b|\bblood pressure\b/i],
    expansions: ['hypertension', 'high blood pressure', 'blood pressure', 'ارتفاع ضغط الدم', 'ضغط الدم'],
    topicTag: 'hypertension',
  },
  {
    patterns: [/أنيميا|انيميا|فقر الدم|هيموجلوبين|\banemia\b|\banaemia\b|\bhemoglobin\b/i],
    expansions: ['anemia', 'anaemia', 'red blood cells', 'hemoglobin', 'فقر الدم', 'الأنيميا'],
    topicTag: 'anemia',
  },
  {
    patterns: [/ربو|الربو|حساسية صدر|شعب هوائية|\basthma\b|\bairways\b/i],
    expansions: ['asthma', 'airways', 'bronchial', 'الربو', 'الممرات الهوائية'],
    topicTag: 'asthma',
  },
  {
    patterns: [/صداع|شقيقة|الصداع النصفي|وجع راس|\bheadache\b|\bmigraine\b/i],
    expansions: ['headache', 'migraine', 'head pain', 'الصداع', 'الشقيقة'],
    topicTag: 'headache',
  },
  {
    patterns: [/قلب|القلب|دورة دموية|أوعية دموية|شرايين|\bheart\b|\bcardiovascular\b|\bcirculation\b|\bblood circulation\b/i],
    expansions: ['heart', 'cardiovascular', 'blood circulation', 'arteries', 'القلب', 'الأوعية الدموية', 'الدورة الدموية'],
    topicTag: 'cardiovascular',
  },
  {
    patterns: [/كبد|الكبد|\bliver\b|\bhepatic\b|\bhepatitis\b/i],
    expansions: ['liver', 'hepatic', 'liver function', 'الكبد', 'وظائف الكبد'],
    topicTag: 'liver',
  },
  {
    patterns: [/رئة|رئتين|جهاز تنفسي|تنفس|\brespiratory\b|\blungs?\b|\bbreathing\b/i],
    expansions: ['respiratory system', 'lungs', 'breathing', 'الجهاز التنفسي', 'الرئتين'],
    topicTag: 'respiratory',
  },
  {
    patterns: [/هضم|جهاز هضمي|معدة|أمعاء|قولون|\bdigestive\b|\bstomach\b|\bgastrointestinal\b/i],
    expansions: ['digestive system', 'stomach', 'intestines', 'digestion', 'الجهاز الهضمي', 'المعدة'],
    topicTag: 'digestive',
  },
  {
    patterns: [/مناعة|جهاز مناعي|مناعي|\bimmune\b|\bimmunity\b/i],
    expansions: ['immune system', 'immunity', 'white blood cells', 'الجهاز المناعي', 'المناعة'],
    topicTag: 'immune',
  },
  {
    patterns: [/هشاشة عظام|هشاشة العظام|\bosteoporosis\b|\bbone density\b/i],
    expansions: ['osteoporosis', 'bone density', 'bones', 'هشاشة العظام'],
    topicTag: 'osteoporosis',
  },
  {
    patterns: [/زهايمر|ألزهايمر|خرف|\balzheimer\b|\bdementia\b/i],
    expansions: ["alzheimer's disease", 'dementia', 'memory', 'مرض ألزهايمر', 'الخرف'],
    topicTag: 'alzheimer',
  },
  {
    patterns: [/التهاب|الالتهاب|\binflammation\b|\binflammatory\b/i],
    expansions: ['inflammation', 'inflammatory response', 'immune response', 'الالتهاب'],
    topicTag: 'inflammation',
  },
  {
    patterns: [/وقاية|الوقاية|تطعيم|لقاح|لقاحات|صحة عامة|سلامة الغذاء|\bprevention\b|\bvaccination\b|\bvaccine\b|\bpublic health\b|\bfood safety\b/i],
    expansions: ['disease prevention', 'vaccination', 'immunization', 'public health', 'food safety', 'الوقاية', 'التطعيم', 'اللقاحات', 'الصحة العامة', 'سلامة الغذاء'],
    topicTag: 'prevention',
  },
  {
    patterns: [/حميد|خبيث|حاد|مزمن|مصطلح|\bbenign\b|\bmalignant\b|\bacute\b|\bchronic\b|\bmedical terminology\b/i],
    expansions: ['benign', 'malignant', 'acute', 'chronic', 'tumor', 'حميد', 'حاد', 'مزمن'],
    topicTag: 'terminology',
  },
  {
    patterns: [/كلى|الكلى|كلية|الفشل الكلوي|\bkidney\b|\brenal\b/i],
    expansions: ['kidney', 'renal', 'kidneys', 'kidney disease', 'الكلى', 'أمراض الكلى'],
    topicTag: 'kidney',
  },
  {
    patterns: [/جلطة|سكتة دماغية|\bstroke\b/i],
    expansions: ['stroke', 'cerebrovascular', 'brain attack', 'السكتة الدماغية'],
    topicTag: 'stroke',
  },
  {
    patterns: [/غدة درقية|\bthyroid\b/i],
    expansions: ['thyroid', 'thyroid gland', 'endocrine', 'الغدة الدرقية'],
    topicTag: 'thyroid',
  },
  {
    patterns: [/سرطان|أورام|ورم|\bcancer\b|\btumor\b|\boncology\b/i],
    expansions: ['cancer', 'tumor', 'malignant', 'benign', 'السرطان'],
    topicTag: 'cancer',
  },
  {
    patterns: [/سمنة|وزن زائد|\bobesity\b|\boverweight\b/i],
    expansions: ['obesity', 'overweight', 'body mass index', 'السمنة'],
    topicTag: 'obesity',
  },
];

// Normalize Egyptian Arabic colloquialisms and Arabic character variants
export function normalizeArabicText(text: string): string {
  return text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    // Egyptian colloquialisms -> standard stems
    .replace(/\bايه هو\b/g, 'ما هو')
    .replace(/\bايه هي\b/g, 'ما هي')
    .replace(/\bازاي\b/g, 'كيف')
    .replace(/\bعشان\b/g, 'لأن')
    .replace(/\bبيشتغل\b/g, 'يعمل')
    .replace(/\bبتشتغل\b/g, 'تعمل')
    .replace(/\bوجع\b/g, 'الم')
    .replace(/\bالسكر\b/g, 'السكري')
    .replace(/\bسخونيه\b/g, 'حمي')
    .trim();
}

export function normalizeTextForSearch(text: string): string {
  const arNorm = normalizeArabicText(text.toLowerCase());
  return arNorm.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const FOLLOWUP_STOP_WORDS = new Set([
  'what', 'is', 'are', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'how', 'does', 'do', 'why',
  'when', 'which', 'about', 'can', 'you', 'explain', 'tell', 'me', 'more', 'this', 'that', 'it', 'its',
  'general', 'medical', 'health', 'condition', 'disease', 'symptoms', 'causes', 'risk', 'factors',
  'ما', 'هو', 'هي', 'في', 'من', 'عن', 'على', 'كيف', 'لماذا', 'هل', 'اشرح', 'وضح', 'لي', 'مرض',
  'اعراض', 'اسباب', 'عوامل', 'عامه', 'معلومات', 'طبيه',
]);

function extractFallbackTopicTermsFromHistory(history: ChatTurnHistory[]): string[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const norm = normalizeTextForSearch(turn.text);
    const tokens = norm
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !FOLLOWUP_STOP_WORDS.has(t));
    if (tokens.length > 0) {
      return tokens.slice(0, 4);
    }
  }
  return [];
}

function extractTopicAnchorFromHistory(history: ChatTurnHistory[]): string | null {
  // Look backward through user messages (NOT assistant answers as evidence!) to resolve pronoun follow-ups like "What are its types?"
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    for (const entry of MEDICAL_SYNONYM_MAP) {
      if (entry.patterns.some((re) => re.test(turn.text))) {
        return entry.topicTag;
      }
    }
  }
  return null;
}

export function processQuery(
  rawQuery: string,
  history: ChatTurnHistory[] = [],
  uiLang: Language = 'ar'
): ProcessedQuery {
  const originalQuery = (rawQuery || '').trim();
  const detectedLanguage = detectQueryLanguage(originalQuery);
  const responseLanguage: Language = uiLang === 'en' ? 'en' : 'ar';

  const normalizedQuery = normalizeTextForSearch(originalQuery);

  // Check if current query has an explicit topic or relies on conversation history pronoun ("its", "أنواعه")
  const matchedExpansions: string[] = [];
  let explicitTopic: string | null = null;

  for (const entry of MEDICAL_SYNONYM_MAP) {
    if (entry.patterns.some((re) => re.test(originalQuery) || re.test(normalizedQuery))) {
      explicitTopic = explicitTopic || entry.topicTag;
      matchedExpansions.push(...entry.expansions);
    }
  }

  let topicAnchor = explicitTopic;
  const wordCount = normalizedQuery.split(/\s+/).filter(Boolean).length;
  const lastAssistantTurn = [...history].reverse().find((h) => h.role === 'model');
  const isAnsweringClarification = Boolean(
    lastAssistantTurn &&
      (/[؟?]\s*$/.test(lastAssistantTurn.text.trim()) ||
        /(هل تقصد|ما الجانب|ممكن توضح|توضيح|تقصد|could you clarify|which|what specifically|do you mean)/i.test(
          lastAssistantTurn.text
        ))
  );
  const hasBackReferencePronoun =
    /(\bits\b|\btheir\b|\bthis condition\b|\bthis disease\b|\bthat\b|\bit\b|أنواعه|انواعه|أعراضه|اعراضه|أسبابه|اسبابه|ارتفاعه|انخفاضه|عنه|منه|فيها|مضاعفاته|هذا المرض|هذه الحالة)/i.test(
      originalQuery
    );
  const isGenericAspectTopic =
    explicitTopic === 'prevention' || explicitTopic === 'terminology';
  const shouldInheritHistoryTopic =
    (!explicitTopic &&
      (hasBackReferencePronoun || isAnsweringClarification || (history.length > 0 && wordCount <= 5))) ||
    (isGenericAspectTopic && (isAnsweringClarification || hasBackReferencePronoun));

  if (shouldInheritHistoryTopic) {
    const historyAnchor = extractTopicAnchorFromHistory(history);
    if (historyAnchor && historyAnchor !== explicitTopic) {
      topicAnchor = historyAnchor;
      const anchorEntry = MEDICAL_SYNONYM_MAP.find((e) => e.topicTag === historyAnchor);
      if (anchorEntry) {
        matchedExpansions.unshift(...anchorEntry.expansions);
      }
    } else if (!explicitTopic) {
      const historyTerms = extractFallbackTopicTermsFromHistory(history);
      if (historyTerms.length > 0) {
        topicAnchor = historyTerms[0];
        matchedExpansions.unshift(...historyTerms);
      }
    }
  }

  const expandedTerms = Array.from(new Set(matchedExpansions));
  const retrievalQuery = [
    normalizedQuery,
    topicAnchor ? topicAnchor : '',
    ...expandedTerms.slice(0, 6),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    originalQuery,
    normalizedQuery,
    retrievalQuery,
    detectedLanguage,
    responseLanguage,
    expandedTerms,
    topicAnchor,
  };
}
