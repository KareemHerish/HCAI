/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessage, Language, MessageStatus, RagStructuredData } from '../types';

const TERMINAL_OR_INTENTIONAL_STATUSES = new Set<string>([
  'emergency',
  'red_flag',
  'greeting',
  'clarification_required',
  'diagnosis_request',
  'treatment_request',
  'medication_request',
  'out_of_scope',
  'insufficient_evidence',
  'refused',
]);

// Patterns indicating an empty/placeholder or overly vague non-answer with no real substance
const VAGUE_PLACEHOLDER_PATTERNS: RegExp[] = [
  /^(حصل خطأ بسيط|حدث خطأ|غير واضح|لا أعرف|لا اعرف|لا أدري|لا ادري|يعتمد على الحالة|قد يختلف|مش واضح)\.?$/i,
  /^(an error occurred|unclear|i don't know|i am not sure|i'm not sure|it depends|it varies|not sure|cannot determine)\.?$/i,
];

// Patterns indicating the model is explicitly guessing the user's unclear intent instead of asking
const GUESSING_INTENT_PATTERNS: RegExp[] = [
  /(أخمن أنك تقصد|اخمن انك تقصد|ربما تقصد|أفترض أنك تقصد|افترض انك تقصد|أعتقد أنك تقصد|اعتقد انك تقصد|لعلّك تقصد|لعلك تقصد)/i,
  /\b(i(?:'m| am)? guessing you mean|assuming you meant|perhaps you mean|maybe you meant|i assume you(?:'re| are) asking about)\b/i,
];

export class VagueChatbotOutputError extends Error {
  readonly elapsedSeconds?: number;
  readonly modelName?: string;

  constructor(message = 'Chatbot output was too vague or guessed user intent.', elapsedSeconds?: number, modelName?: string) {
    super(message);
    this.name = 'VagueChatbotOutputError';
    this.elapsedSeconds = elapsedSeconds;
    this.modelName = modelName;
  }
}

/**
 * Checks whether a non-terminal chatbot payload is empty, overly vague, or guessing
 * user intent without asking a clarifying question.
 */
export function isChatbotOutputTooVague(
  data: {
    status?: string;
    reply?: string;
    answer?: {
      direct_answer?: string;
      detailed_explanation?: string;
    };
    sources?: unknown[];
  } | null | undefined,
  resolvedReplyText: string
): boolean {
  if (!data) return true;
  const status = (data.status || '').toLowerCase();
  if (TERMINAL_OR_INTENTIONAL_STATUSES.has(status)) {
    return false;
  }

  const direct = (data.answer?.direct_answer || resolvedReplyText || '').trim();
  const detail = (data.answer?.detailed_explanation || '').trim();
  const combined = [direct, detail].filter(Boolean).join(' ').trim();
  const hasVerifiedSources = Array.isArray(data.sources) && data.sources.length > 0;

  if (!combined) return true;

  // Strip punctuation/symbols to measure actual informative content
  const cleanContent = combined.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = cleanContent ? cleanContent.split(/\s+/).length : 0;

  if (!hasVerifiedSources && (cleanContent.length < 18 || wordCount < 3)) {
    return true;
  }

  if (!hasVerifiedSources && VAGUE_PLACEHOLDER_PATTERNS.some((re) => re.test(direct))) {
    return true;
  }

  // If the output explicitly guesses user intent without asking a clarifying question and has no grounded sources
  const asksQuestion = /[؟?]\s*$/.test(combined) || /[؟?]/.test(direct);
  if (!hasVerifiedSources && !asksQuestion && GUESSING_INTENT_PATTERNS.some((re) => re.test(combined))) {
    return true;
  }

  return false;
}

/**
 * Builds a structured clarification_required assistant message that asks the user
 * to clarify their question rather than guessing intent.
 */
export function buildClarificationFallbackMessage(
  queryText: string,
  requestLang: Language,
  elapsedSeconds: number,
  modelName?: string
): ChatMessage {
  const isAr = requestLang === 'ar';
  const snippet = queryText.trim().slice(0, 60);

  const clarificationText = isAr
    ? snippet
      ? `لم يتضح لي سؤالك كاملاً بخصوص «${snippet}» ولا أريد أن أخمن ما تقصده. هل يمكنك توضيح الموضوع الطبي أو الجانب المحدد الذي تود السؤال عنه (مثل التعريف، الأعراض العامة، الأسباب، أو الوقاية) حتى أتمكن من مساعدتك بدقة؟`
      : 'لم يتضح لي سؤالك كاملاً ولا أريد أن أخمن ما تقصده. هل يمكنك توضيح الموضوع الطبي أو الصحي العام الذي تود معرفة معلومات عنه؟'
    : snippet
    ? `Your question about "${snippet}" isn't clear enough yet, and I don't want to guess what you mean. Could you clarify the exact medical topic or aspect you'd like to learn about (such as definition, general symptoms, causes, or prevention) so I can help accurately?`
    : "Your question isn't specific enough yet, and I don't want to guess what you mean. Could you clarify which general medical or health topic you'd like to learn about?";

  const ragData: RagStructuredData = {
    status: 'clarification_required' as MessageStatus,
    language: requestLang,
    category: 'AMBIGUOUS',
    knowledge_source: 'none',
    answer: {
      direct_answer: clarificationText,
      detailed_explanation: '',
      retrieved_context_summary: isAr
        ? 'تم طلب توضيح إضافي قبل الإجابة لتجنب التخمين وضمان دقة المعلومة.'
        : 'Additional clarification was requested before answering to avoid guessing user intent.',
      educational_disclaimer: '',
    },
    sources: [],
    follow_up_questions: [],
    evidence_used: [],
  };

  return {
    id: `clarify_${Date.now()}`,
    sender: 'assistant',
    text: clarificationText,
    timestamp: Date.now(),
    status: 'clarification_required',
    seconds: elapsedSeconds,
    model: modelName || (isAr ? 'صحتي' : 'Sehati'),
    ragData,
  };
}
