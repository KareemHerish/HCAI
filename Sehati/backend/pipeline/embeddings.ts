/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { normalizeTextForSearch } from './queryProcessor.js';

export const LOCAL_EMBED_DIM = 256;

// Cross-lingual medical concept buckets mapping both Arabic and English terms
// into shared semantic dimensions for deterministic multilingual vector similarity
const CONCEPT_BUCKETS: RegExp[] = [
  /diabetes|glucose|insulin|a1c|pancreas|السكري|السكر|انسولين|أنسولين|جلوكوز|بنكرياس/i,
  /hypertension|blood pressure|systolic|diastolic|ضغط الدم|ارتفاع الضغط|الضغط العالي/i,
  /anemia|anaemia|hemoglobin|red blood|iron|فقر الدم|انيميا|أنيميا|هيموجلوبين|حديد/i,
  /asthma|airway|bronch|wheez|inhaler|الربو|ربو|شعب هوائيه|حساسيه صدر/i,
  /heart|cardiovascular|artery|arteries|circulation|blood vessel|قلب|قلبيه|اوعيه دمويه|شرايين|دوره دمويه/i,
  /liver|hepatic|hepatitis|bile|كبد|الكبد|التهاب كبدي/i,
  /lung|lungs|respiratory|oxygen|breath|رئه|رئتين|جهاز تنفسي|تنفس|اكسجين/i,
  /digestive|stomach|intestine|colon|gut|digestion|هضم|جهاز هضمي|معده|امعاء|قولون/i,
  /immune|immunity|white blood|antibody|antibod|مناعه|جهاز مناعي|اجسام مضاده|كريات دم بيضاء/i,
  /inflammation|inflammatory|swelling|التهاب|التهابات|تورم/i,
  /headache|migraine|head pain|صداع|شقيقه|صداع نصفي/i,
  /osteoporosis|bone|bones|calcium|skeleton|هشاشه العظام|عظام|كثافه العظام|كالسيوم/i,
  /alzheimer|dementia|memory|cognitive|brain|زهايمر|الزهايمر|خرف|ذاكره|دماغ|مخ/i,
  /kidney|kidneys|renal|nephron|urine|كلي|الكلي|كليه|فشل كلوي/i,
  /prevention|prevent|vaccine|vaccination|immunization|public health|وقايه|الوقايه|تطعيم|لقاح|صحه عامه/i,
  /food safety|hygiene|wash hands|contamination|سلامه الغذاء|نظافه|تسمم غذائي/i,
  /benign|malignant|tumor|cancer|oncology|حميد|خبيث|ورم|سرطان/i,
  /acute|chronic|terminology|definition|حاد|مزمن|مصطلح|تعريف/i,
  /stroke|cerebrovascular|clot|سكته دماغيه|جلطه/i,
  /thyroid|hormone|endocrine|غده درقيه|هرمون|غدد صماء/i,
  /obesity|overweight|bmi|nutrition|diet|سمنه|وزن زائد|تغذيه/i,
  /depression|anxiety|mental health|sleep|insomnia|اكتئاب|قلق|صحه نفسيه|نوم|ارق/i,
  /fever|infection|virus|bacteria|antibiotic|حمي|عدوي|فيروس|بكتيريا|مضاد حيوي/i,
  /anatomy|physiology|organ|system|function|تشريح|فسيولوجيا|عضو|جهاز|وظيفه/i,
];

function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  if (sumSq === 0) return vec;
  const norm = Math.sqrt(sumSq);
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic multilingual dense embedding (256-dim):
 * - First 48 dimensions: cross-lingual medical concept projections (Arabic + English aligned)
 * - Remaining 208 dimensions: hashed subword character trigrams + word bigrams
 */
export function computeLocalMultilingualEmbedding(text: string): number[] {
  const vec = new Array<number>(LOCAL_EMBED_DIM).fill(0);
  const normalized = normalizeTextForSearch(text);
  if (!normalized) return vec;

  // 1. Cross-lingual concept projection (dims 0..47)
  CONCEPT_BUCKETS.forEach((re, idx) => {
    const matches = normalized.match(new RegExp(re.source, 'gi'));
    if (matches && matches.length > 0 && idx * 2 + 1 < 48) {
      const weight = 2.5 + Math.min(matches.length, 4) * 0.5;
      vec[idx * 2] += weight;
      vec[idx * 2 + 1] += weight * 0.7;
    }
  });

  // 2. Token + subword n-gram projection (dims 48..255)
  const subSpace = LOCAL_EMBED_DIM - 48;
  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const h = fnv1aHash(tok);
    const dim = 48 + (h % subSpace);
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[dim] += sign * 1.2;

    // Character 3-grams for morphological robustness (Arabic & English stems)
    if (tok.length >= 3) {
      for (let j = 0; j <= tok.length - 3; j++) {
        const tri = tok.slice(j, j + 3);
        const th = fnv1aHash(tri);
        const tDim = 48 + (th % subSpace);
        const tSign = (th & 1) === 0 ? 1 : -1;
        vec[tDim] += tSign * 0.35;
      }
    }

    // Word bigram
    if (i + 1 < tokens.length) {
      const bi = `${tok}_${tokens[i + 1]}`;
      const bh = fnv1aHash(bi);
      const bDim = 48 + (bh % subSpace);
      vec[bDim] += ((bh & 1) === 0 ? 1 : -1) * 0.8;
    }
  }

  return l2Normalize(vec);
}

let cachedAiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

/**
 * Generates neural multilingual embeddings via `gemini-embedding-2` when API key is active.
 * Returns null gracefully if unavailable so caller can seamlessly rely on local multilingual vectors.
 */
export async function embedTextsWithGemini(texts: string[]): Promise<number[][] | null> {
  const ai = getAiClient();
  if (!ai || texts.length === 0) return null;

  try {
    const response = await Promise.race([
      ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: texts,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Embedding timeout')), 12000)
      ),
    ]);

    const embeddings = response.embeddings?.map((e) => e.values || []) || [];
    if (embeddings.length === texts.length && embeddings.every((v) => v.length > 0)) {
      return embeddings.map(l2Normalize);
    }
    return null;
  } catch (err: any) {
    console.warn('Gemini embedContent fallback to local multilingual vector:', err?.message || err);
    return null;
  }
}
