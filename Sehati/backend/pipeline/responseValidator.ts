/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAllowedSourceName, isAllowedSourceUrl } from '../config/allowlist.js';
import {
  Language,
  ProcessedQuery,
  RagApiPayload,
  RetrievedChunk,
  SourceCitation,
  StructuredRagResponseSchema,
} from '../types.js';
import { GeneralKnowledgeLlmOutput, RawLlmOutput } from './answerGenerator.js';
import { EDUCATIONAL_DISCLAIMER_AR, EDUCATIONAL_DISCLAIMER_EN } from './safetyFilter.js';

// Post-generation safety patterns to catch any accidental clinical/prescriptive leakage from LLM
const PROHIBITED_OUTPUT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(you (likely |probably )?have|you are suffering from|your diagnosis is|i diagnose you)\b/i,
    reason: 'Prohibited personal diagnosis language detected in output.',
  },
  {
    pattern: /(أنت مصاب بـ|انت مصاب ب|تشخيص حالتك هو|عندك مرض)/i,
    reason: 'Prohibited personal diagnosis language detected in Arabic output.',
  },
  {
    pattern: /\b(take \d+\s*(mg|ml|pills|tablets|capsules)|i (recommend|prescribe) taking|you should take .* (medication|pill|drug|antibiotic|insulin))\b/i,
    reason: 'Prohibited medication or dosage recommendation detected in output.',
  },
  {
    pattern: /(يجب أن تأخذ|خذ\s*\d+\s*(قرص|حبة|كبسولة|مل)|أنصحك بتناول دواء|الجرعة المناسبة لك هي)/i,
    reason: 'Prohibited medication or dosage instruction detected in Arabic output.',
  },
  {
    pattern: /\b(follow this treatment plan|start taking|stop taking your medication)\b/i,
    reason: 'Prohibited treatment/regimen recommendation detected in output.',
  },
];

// Filter follow-up questions that invite self-diagnosis or drug dosing
const UNSAFE_FOLLOWUP_PATTERNS = [
  /diagnos|which drug|what medicine should|what dose|dosage|how much should i take|treat my/i,
  /شخص|أخد دواء|جرعة|كام حبة|علاج حالتي|أشرب إيه عشان أخف/i,
];

function buildConciseReply(directAnswer: string, detailedExplanation: string): string {
  const d = directAnswer.trim();
  const det = detailedExplanation.trim();
  if (!det || det === d) return d;
  return `${d}\n\n${det}`;
}

function stripUrlsFromText(text: string): string {
  return text.replace(/https?:\/\/[^\s)]+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

export function normalizeFollowUpToUserRequest(raw: string, lang: Language): string {
  let text = raw.trim();
  if (!text) return text;

  if (lang === 'ar') {
    const arRewrites: Array<[RegExp, string]> = [
      [/^هل\s+(?:تود|تريد|ترغب|تحب)\s+(?:في\s+)?(?:أن\s+)?أشرح\s+لك\s+/u, 'أود أن تشرح لي '],
      [/^هل\s+(?:تود|تريد|ترغب|تحب)\s+(?:في\s+)?(?:أن\s+)?(?:تعرف|تتعرف|تطلع)\s+(?:المزيد\s+)?(?:على|عن)\s+/u, 'أود معرفة المزيد عن '],
      [/^هل\s+(?:تود|تريد|ترغب|تحب)\s+(?:في\s+)?(?:أن\s+)?(?:تعرف|معرفة)\s+/u, 'أود معرفة '],
      [/^هل\s+(?:تود|تريد|ترغب|تحب)\s+(?:في\s+)?التعرف\s+على\s+/u, 'أود التعرف على '],
      [/^هل\s+(?:تود|تريد|ترغب|تحب)\s+(?:في\s+)?/u, 'أود '],
      [/^هل\s+لديك\s+(?:سؤال|استفسار|أي\s+سؤال|أي\s+استفسار)\s+(?:طبي\s+عام\s+)?(?:حول|عن|في|تود\s+الاستفسار\s+عنه)\s*/u, 'أود الاستفسار عن '],
      [/^هل\s+يمكنني\s+(?:مساعدتك\s+في\s+|شرح\s+)/u, 'أود معرفة المزيد عن '],
    ];

    for (const [pattern, replacement] of arRewrites) {
      if (pattern.test(text)) {
        text = text.replace(pattern, replacement).replace(/[؟?]+$/u, '').trim();
        break;
      }
    }
    return text;
  }

  const enRewrites: Array<[RegExp, string]> = [
    [/^(?:would you like|do you want)\s+me\s+to\s+explain\s+/i, 'Please explain '],
    [/^(?:would you like|do you want)\s+to\s+(?:know|learn)\s+(?:more\s+)?about\s+/i, "I'd like to know more about "],
    [/^(?:would you like|do you want)\s+to\s+(?:know|learn)\s+/i, "I'd like to know "],
    [/^(?:would you like|do you want)\s+to\s+/i, "I'd like to "],
    [/^are you interested in\s+(?:learning|knowing)\s+(?:more\s+)?about\s+/i, "I'd like to learn about "],
    [/^are you interested in\s+(?:learning|knowing)\s+/i, "I'd like to learn "],
    [/^are you interested in\s+/i, "I'd like to know about "],
    [/^do you have (?:any )?(?:questions?|a question) about\s+/i, "I'd like to know more about "],
  ];

  for (const [pattern, replacement] of enRewrites) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement).replace(/[?]+$/, '').trim();
      break;
    }
  }

  return text;
}

function filterFollowUps(
  followUps: string[] | undefined,
  lang: Language
): string[] {
  const matchesTargetLanguage = (text: string): boolean => {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasLatin = /[a-zA-Z]{3,}/.test(text);
    if (lang === 'ar') return hasArabic;
    return hasLatin && !hasArabic;
  };

  return (followUps || [])
    .map((q) => normalizeFollowUpToUserRequest(q, lang))
    .filter(
      (q) =>
        q.length > 5 &&
        matchesTargetLanguage(q) &&
        !UNSAFE_FOLLOWUP_PATTERNS.some((re) => re.test(q))
    )
    .slice(0, 3);
}

function buildSafetyRejectedOutputPayload(
  processedQuery: ProcessedQuery,
  usedModel: string,
  startTimeMs: number,
  reason: string,
  totalRetrievedCount: number,
  validatedCount: number
): RagApiPayload {
  const lang: Language = processedQuery.responseLanguage;
  const elapsed = Number(((Date.now() - startTimeMs) / 1000).toFixed(3));
  const refusalDirect =
    lang === 'ar'
      ? 'تم حجب الإجابة المولّدة بواسطة فحص الأمان الطبي النهائي.'
      : 'The generated response was withheld by post-generation medical safety validation.';
  const refusalDetail =
    lang === 'ar'
      ? 'لا يقدم هذا النظام تشخيصاً شخصياً أو وصفات دوائية أو توصيات علاجية فردية. يُرجى مراجعة طبيب مختص للتقييم الشخصي.'
      : 'This system cannot provide personal diagnosis, medication dosing, or treatment advice. Please consult a licensed healthcare professional.';
  const disclaimer = lang === 'ar' ? EDUCATIONAL_DISCLAIMER_AR : EDUCATIONAL_DISCLAIMER_EN;

  return {
    status: 'diagnosis_request',
    language: lang,
    category: 'SAFE_MEDICAL_EDUCATION',
    knowledge_source: 'none',
    answer: {
      direct_answer: refusalDirect,
      detailed_explanation: refusalDetail,
      retrieved_context_summary:
        lang === 'ar'
          ? 'تم رفض المخرجات لعدم مطابقتها لمعايير السلامة الطبية.'
          : 'Generated output failed strict medical safety policy checks.',
      educational_disclaimer: disclaimer,
    },
    sources: [],
    follow_up_questions: [],
    reply: `${refusalDirect}\n\n${refusalDetail}`,
    seconds: elapsed,
    model: usedModel,
    triggerType: reason,
    evidence_used: [],
    pipeline_trace: {
      category: 'SAFE_MEDICAL_EDUCATION',
      detected_language: processedQuery.detectedLanguage,
      retrieved_count: totalRetrievedCount,
      validated_count: validatedCount,
      validation_passed: false,
      knowledge_source: 'none',
    },
  };
}

export function buildInsufficientEvidencePayload(
  processedQuery: ProcessedQuery,
  startTimeMs: number,
  reasonNote?: string,
  modelName = 'Knowledge Availability Gate',
  classificationSource?: 'deterministic_emergency' | 'semantic_llm' | 'heuristic_fallback'
): RagApiPayload {
  const lang: Language = processedQuery.responseLanguage;
  const elapsed = Number(((Date.now() - startTimeMs) / 1000).toFixed(3));

  const msgEn =
    'Reliable information is currently unavailable to answer this question accurately.';
  const msgAr =
    'المعلومات الموثوقة غير متوفرة حالياً للإجابة عن هذا السؤال بدقة.';

  const detailEn =
    'Neither the local Knowledge Base nor reliable general medical knowledge could confirm an accurate educational answer for this query. Please check the medical term or ask about a recognized health or medical topic.';
  const detailAr =
    'لم تتوفر معلومات كافية في قاعدة المعرفة المحلية أو المعرفة الطبية العامة الموثوقة لتقديم إجابة دقيقة لهذا السؤال. يرجى التأكد من المصطلح أو طرح سؤال حول موضوع طبي أو صحي معروف.';

  const direct = lang === 'ar' ? msgAr : msgEn;
  const detail = lang === 'ar' ? detailAr : detailEn;
  const disclaimer = lang === 'ar' ? EDUCATIONAL_DISCLAIMER_AR : EDUCATIONAL_DISCLAIMER_EN;

  return {
    status: 'insufficient_evidence',
    language: lang,
    category: 'SAFE_MEDICAL_EDUCATION',
    knowledge_source: 'none',
    answer: {
      direct_answer: direct,
      detailed_explanation: detail,
      retrieved_context_summary:
        reasonNote ||
        (lang === 'ar'
          ? 'لم تتوفر معلومات موثوقة في قاعدة المعرفة أو المعرفة الطبية العامة.'
          : 'Reliable supporting information was unavailable in both the Knowledge Base and general medical knowledge.'),
      educational_disclaimer: disclaimer,
    },
    sources: [],
    follow_up_questions: [],
    reply: `${direct}\n\n${detail}`,
    seconds: elapsed,
    model: modelName,
    evidence_used: [],
    pipeline_trace: {
      category: 'SAFE_MEDICAL_EDUCATION',
      detected_language: processedQuery.detectedLanguage,
      retrieved_count: 0,
      validated_count: 0,
      validation_passed: true,
      knowledge_source: 'none',
      classification_source: classificationSource,
    },
  };
}

export function validateAndAssembleResponse(
  rawLlm: RawLlmOutput,
  validatedChunks: RetrievedChunk[],
  processedQuery: ProcessedQuery,
  usedModel: string,
  startTimeMs: number,
  conflictsDetected: string[] = [],
  totalRetrievedCount = validatedChunks.length,
  classificationSource?: 'deterministic_emergency' | 'semantic_llm' | 'heuristic_fallback'
): RagApiPayload {
  const lang: Language = processedQuery.responseLanguage;
  const elapsed = Number(((Date.now() - startTimeMs) / 1000).toFixed(3));

  if (!rawLlm.has_sufficient_evidence) {
    return buildInsufficientEvidencePayload(
      processedQuery,
      startTimeMs,
      lang === 'ar'
        ? 'أفادت عملية التحقق بعدم كفاية الأدلة المسترجعة للإجابة الموثوقة.'
        : 'Grounded check determined retrieved evidence was insufficient for a reliable answer.',
      usedModel,
      classificationSource
    );
  }

  const combinedGeneratedText = [
    rawLlm.direct_answer,
    rawLlm.detailed_explanation,
    rawLlm.retrieved_context_summary,
  ].join('\n');

  for (const rule of PROHIBITED_OUTPUT_PATTERNS) {
    if (rule.pattern.test(combinedGeneratedText)) {
      console.warn('Post-generation safety rejection:', rule.reason);
      return buildSafetyRejectedOutputPayload(
        processedQuery,
        usedModel,
        startTimeMs,
        rule.reason,
        totalRetrievedCount,
        validatedChunks.length
      );
    }
  }

  const chunkLookup = new Map<string, RetrievedChunk>();
  for (const c of validatedChunks) {
    chunkLookup.set(c.chunk_id, c);
  }

  const verifiedSources: SourceCitation[] = [];
  const seenSourceKeys = new Set<string>();

  for (const cited of rawLlm.cited_evidence || []) {
    const matchedChunk = chunkLookup.get(cited.chunk_id);
    if (!matchedChunk) continue;

    if (!isAllowedSourceName(matchedChunk.source_name) || !isAllowedSourceUrl(matchedChunk.source_url)) {
      continue;
    }

    const dedupKey = `${matchedChunk.source_name}::${matchedChunk.title}::${matchedChunk.source_url || matchedChunk.document_id}`;
    if (seenSourceKeys.has(dedupKey)) continue;
    seenSourceKeys.add(dedupKey);

    verifiedSources.push({
      source_name: matchedChunk.source_name,
      title: matchedChunk.title,
      url: matchedChunk.source_url,
      publication_date: matchedChunk.publication_date,
      evidence:
        cited.evidence_excerpt?.trim() ||
        matchedChunk.text.slice(0, 220).trim() + '...',
    });
  }

  if (verifiedSources.length === 0 && validatedChunks.length > 0) {
    for (const chunk of validatedChunks.slice(0, 2)) {
      const dedupKey = `${chunk.source_name}::${chunk.title}::${chunk.source_url || chunk.document_id}`;
      if (seenSourceKeys.has(dedupKey)) continue;
      seenSourceKeys.add(dedupKey);
      verifiedSources.push({
        source_name: chunk.source_name,
        title: chunk.title,
        url: chunk.source_url,
        publication_date: chunk.publication_date,
        evidence: chunk.text.slice(0, 220).trim() + '...',
      });
    }
  }

  if (verifiedSources.length === 0) {
    return buildInsufficientEvidencePayload(processedQuery, startTimeMs, undefined, usedModel, classificationSource);
  }

  const safeFollowUps = filterFollowUps(rawLlm.follow_up_questions, lang);
  const disclaimer = lang === 'ar' ? EDUCATIONAL_DISCLAIMER_AR : EDUCATIONAL_DISCLAIMER_EN;

  const directTrimmed = rawLlm.direct_answer.trim();
  const detailTrimmed =
    rawLlm.detailed_explanation.trim() === directTrimmed ? '' : rawLlm.detailed_explanation.trim();

  const structuredCandidate = {
    status: 'success' as const,
    language: lang,
    category: 'SAFE_MEDICAL_EDUCATION' as const,
    knowledge_source: 'knowledge_base' as const,
    answer: {
      direct_answer: directTrimmed,
      detailed_explanation: detailTrimmed,
      retrieved_context_summary: rawLlm.retrieved_context_summary.trim(),
      educational_disclaimer: disclaimer,
    },
    sources: verifiedSources,
    follow_up_questions: safeFollowUps,
  };

  const schemaCheck = StructuredRagResponseSchema.safeParse(structuredCandidate);
  if (!schemaCheck.success) {
    console.warn('Structured Zod validation failed:', schemaCheck.error.flatten());
    return buildInsufficientEvidencePayload(processedQuery, startTimeMs, undefined, usedModel, classificationSource);
  }

  const verified = schemaCheck.data;

  const evidenceUsed = validatedChunks.map((c) => ({
    chunk_id: c.chunk_id,
    source_name: c.source_name,
    title: c.title,
    url: c.source_url,
    publication_date: c.publication_date,
    excerpt: c.text.length > 360 ? `${c.text.slice(0, 360).trim()}...` : c.text,
    relevance_score: c.hybridScore,
  }));

  return {
    ...verified,
    reply: buildConciseReply(verified.answer.direct_answer, verified.answer.detailed_explanation),
    seconds: elapsed,
    model: usedModel,
    evidence_used: evidenceUsed,
    conflicts_noted: conflictsDetected.length > 0 ? conflictsDetected : undefined,
    pipeline_trace: {
      category: 'SAFE_MEDICAL_EDUCATION',
      detected_language: processedQuery.detectedLanguage,
      retrieved_count: totalRetrievedCount,
      validated_count: validatedChunks.length,
      validation_passed: true,
      knowledge_source: 'knowledge_base',
      classification_source: classificationSource,
    },
  };
}

/**
 * CASE B Validator & Assembler:
 * Handles educational answers generated from general model knowledge when no matching KB passages were found.
 * Enforces empty sources/citations, strips any accidental URLs, runs full safety checks, and clearly marks knowledge_source='general_knowledge'.
 */
export function validateAndAssembleGeneralKnowledgeResponse(
  rawGeneral: GeneralKnowledgeLlmOutput,
  processedQuery: ProcessedQuery,
  usedModel: string,
  startTimeMs: number,
  totalRetrievedCount = 0,
  classificationSource?: 'deterministic_emergency' | 'semantic_llm' | 'heuristic_fallback'
): RagApiPayload {
  const lang: Language = processedQuery.responseLanguage;
  const elapsed = Number(((Date.now() - startTimeMs) / 1000).toFixed(3));

  if (!rawGeneral.has_reliable_answer || !rawGeneral.direct_answer.trim()) {
    return buildInsufficientEvidencePayload(
      processedQuery,
      startTimeMs,
      undefined,
      usedModel,
      classificationSource
    );
  }

  const cleanDirect = stripUrlsFromText(rawGeneral.direct_answer);
  const rawDetail = stripUrlsFromText(rawGeneral.detailed_explanation || '');
  const cleanDetail = rawDetail === cleanDirect ? '' : rawDetail;

  const combinedText = [cleanDirect, cleanDetail].join('\n');
  for (const rule of PROHIBITED_OUTPUT_PATTERNS) {
    if (rule.pattern.test(combinedText)) {
      console.warn('Post-generation safety rejection (Case B):', rule.reason);
      return buildSafetyRejectedOutputPayload(
        processedQuery,
        usedModel,
        startTimeMs,
        rule.reason,
        totalRetrievedCount,
        0
      );
    }
  }

  const contextNotice =
    lang === 'ar'
      ? 'لم تتوفر مقاطع مطابقة في قاعدة المعرفة الطبية المحلية؛ لذلك تعتمد هذه الإجابة على المعرفة الطبية التعليمية العامة دون مصادر مسترجعة.'
      : 'No matching passages were found in the local Knowledge Base; this answer is provided from general educational medical knowledge without retrieved Knowledge Base citations.';

  const disclaimer = lang === 'ar' ? EDUCATIONAL_DISCLAIMER_AR : EDUCATIONAL_DISCLAIMER_EN;
  const safeFollowUps = filterFollowUps(rawGeneral.follow_up_questions, lang);

  const structuredCandidate = {
    status: 'success' as const,
    language: lang,
    category: 'SAFE_MEDICAL_EDUCATION' as const,
    knowledge_source: 'general_knowledge' as const,
    answer: {
      direct_answer: cleanDirect,
      detailed_explanation: cleanDetail,
      retrieved_context_summary: contextNotice,
      educational_disclaimer: disclaimer,
    },
    sources: [],
    follow_up_questions: safeFollowUps,
  };

  const schemaCheck = StructuredRagResponseSchema.safeParse(structuredCandidate);
  if (!schemaCheck.success) {
    console.warn('Structured Zod validation failed (Case B):', schemaCheck.error.flatten());
    return buildInsufficientEvidencePayload(processedQuery, startTimeMs, undefined, usedModel, classificationSource);
  }

  const verified = schemaCheck.data;

  return {
    ...verified,
    reply: buildConciseReply(verified.answer.direct_answer, verified.answer.detailed_explanation),
    seconds: elapsed,
    model: usedModel,
    evidence_used: [],
    pipeline_trace: {
      category: 'SAFE_MEDICAL_EDUCATION',
      detected_language: processedQuery.detectedLanguage,
      retrieved_count: totalRetrievedCount,
      validated_count: 0,
      validation_passed: true,
      knowledge_source: 'general_knowledge',
      classification_source: classificationSource,
    },
  };
}
