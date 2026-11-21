/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAllowedSourceName, isAllowedSourceUrl } from '../config/allowlist';
import { EvidenceValidationResult, ProcessedQuery, RetrievedChunk } from '../types';
import { tokenizeForBm25 } from './vectorStore';

const MIN_VALID_HYBRID_SCORE = 0.34;

const GENERIC_MEDICAL_TERMS = new Set([
  'condition', 'conditions', 'disease', 'diseases', 'symptom', 'symptoms', 'cause', 'causes',
  'risk', 'factor', 'factors', 'system', 'explain', 'mean', 'means', 'meaning', 'type', 'types',
  'main', 'common', 'general', 'health', 'medical', 'information', 'work', 'works', 'function',
  'associated', 'related', 'difference', 'between', 'rare', 'ultra', 'syndrome', 'simply', 'role',
  'body', 'human', 'prevent', 'prevention', 'happen', 'happens', 'help', 'definition', 'tell',
  'merely', 'does', 'when', 'someone', 'person', 'people', 'overview', 'complication', 'complications',
  'مرض', 'امراض', 'اعراض', 'اسباب', 'عوامل', 'خطر', 'جهاز', 'معني', 'انواع', 'عامه', 'معلومات', 'طبيه',
  'وظيفه', 'كيف', 'يعمل', 'تعمل', 'اشرح', 'اشرحلي', 'وضح', 'وضحلي', 'ببساطه', 'الفرق', 'دور', 'جسم',
  'الجسم', 'الانسان', 'مضاعفات', 'طرق', 'كيفيه', 'تعريف', 'مفهوم', 'فائده', 'فوائد', 'اضرار', 'يحدث',
  'يحصل', 'عباره', 'تقولي', 'ممكن', 'سمحت', 'لو', 'عند', 'لدي', 'وقايه', 'الوقايه',
]);

// Filter out any unsafe clinical prescription chunks that might exist in raw web/dataset records
const UNSAFE_CHUNK_INDICATORS = [
  /take \d+\s*(mg|ml|pills|tablets|capsules)\s*(every|daily|per day)/i,
  /تؤخذ\s*\d+\s*(حبة|قرص|كبسولة|مل)/i,
  /أنصحك بتناول دواء/i,
  /i prescribe/i,
];

// Prompt-injection patterns inside retrieved documents
const INJECTION_PATTERNS = [
  /ignore (all )?previous instructions/i,
  /system prompt:/i,
  /you are now a doctor/i,
  /تجاهل التعليمات السابقة/i,
];

function sanitizeEvidenceText(text: string): string {
  let clean = text;
  for (const re of INJECTION_PATTERNS) {
    clean = clean.replace(re, '[redacted]');
  }
  return clean.trim();
}

export function validateEvidence(
  retrievedChunks: RetrievedChunk[],
  processedQuery: ProcessedQuery
): EvidenceValidationResult {
  const validatedChunks: RetrievedChunk[] = [];
  const rejectedChunks: Array<{ chunk_id: string; reason: string }> = [];

  const queryTokens = new Set(tokenizeForBm25(processedQuery.retrievalQuery));
  const rawSpecificTokens = tokenizeForBm25(processedQuery.normalizedQuery).filter(
    (t) => t.length >= 3 && !GENERIC_MEDICAL_TERMS.has(t)
  );
  const expandedLower = new Set(
    processedQuery.expandedTerms.map((e) => e.toLowerCase())
  );

  for (const chunk of retrievedChunks) {
    // 1. Source allowlist verification
    if (!isAllowedSourceName(chunk.source_name)) {
      rejectedChunks.push({
        chunk_id: chunk.chunk_id,
        reason: `Source "${chunk.source_name}" is not on the approved allowlist.`,
      });
      continue;
    }

    if (!isAllowedSourceUrl(chunk.source_url)) {
      rejectedChunks.push({
        chunk_id: chunk.chunk_id,
        reason: `URL "${chunk.source_url}" is outside approved domains.`,
      });
      continue;
    }

    // 2. Minimum quality & length
    if (!chunk.text || chunk.text.trim().length < 60) {
      rejectedChunks.push({
        chunk_id: chunk.chunk_id,
        reason: 'Passage text too short for reliable medical education evidence.',
      });
      continue;
    }

    // 3. Unsafe prescriptive content check
    if (UNSAFE_CHUNK_INDICATORS.some((re) => re.test(chunk.text))) {
      rejectedChunks.push({
        chunk_id: chunk.chunk_id,
        reason: 'Passage contains prescriptive dosing language excluded from educational RAG.',
      });
      continue;
    }

    // 4. Relevance verification (hybrid score + specific query concept overlap)
    const chunkTokens = tokenizeForBm25(`${chunk.title} ${chunk.text}`);
    const chunkTokenSet = new Set(chunkTokens);
    const overlapCount = chunkTokens.filter((t) => queryTokens.has(t)).length;

    // When the user asks about specific non-generic entities (e.g. a disease/organ/code), verify specific entities or mapped bilingual synonyms match
    const specificMatches = rawSpecificTokens.filter(
      (t) => chunkTokenSet.has(t) || (t.startsWith('و') && t.length >= 4 && chunkTokenSet.has(t.slice(1)))
    );
    const hasExpandedConceptMatch =
      expandedLower.size > 0 &&
      Array.from(expandedLower).some((exp) =>
        `${chunk.title} ${chunk.text}`.toLowerCase().includes(exp)
      );

    const requiredSpecificMatches =
      rawSpecificTokens.length >= 3 ? Math.ceil(rawSpecificTokens.length * 0.5) : 1;

    if (
      rawSpecificTokens.length >= 1 &&
      specificMatches.length < requiredSpecificMatches &&
      !hasExpandedConceptMatch
    ) {
      rejectedChunks.push({
        chunk_id: chunk.chunk_id,
        reason: 'Insufficient specific subject terms matched in retrieved passage.',
      });
      continue;
    }

    if (chunk.hybridScore < MIN_VALID_HYBRID_SCORE || (overlapCount === 0 && chunk.vectorScore < 0.45)) {
      rejectedChunks.push({
        chunk_id: chunk.chunk_id,
        reason: `Low relevance score (${chunk.hybridScore}) or zero concept overlap.`,
      });
      continue;
    }

    validatedChunks.push({
      ...chunk,
      text: sanitizeEvidenceText(chunk.text),
    });
  }

  // 5. Conflict detection across sources (e.g., differing numeric reference ranges)
  const conflictsDetected: string[] = [];
  if (validatedChunks.length >= 2) {
    const distinctSources = new Set(validatedChunks.map((c) => c.source_name));
    if (distinctSources.size >= 2) {
      // Check if two chunks mention different blood pressure or glucose thresholds
      const bpMatches = validatedChunks
        .map((c) => ({
          source: c.source_name,
          val: c.text.match(/(\d{2,3}\s*\/\s*\d{2,3})/)?.[1] || null,
        }))
        .filter((x) => x.val !== null);

      const uniqueBpVals = new Set(bpMatches.map((x) => x.val!.replace(/\s+/g, '')));
      if (uniqueBpVals.size > 1) {
        conflictsDetected.push(
          processedQuery.responseLanguage === 'ar'
            ? `تظهر أرقام مرجعية مختلفة عبر المصادر المسترجعة (${Array.from(uniqueBpVals).join(' مقابل ')}). يجب نسب كل رقم بدقة إلى مصدره.`
            : `Different reference threshold figures appear across retrieved sources (${Array.from(uniqueBpVals).join(' vs ')}). Both figures should be attributed accurately to their respective sources.`
        );
      }
    }
  }

  if (validatedChunks.length === 0) {
    return {
      isSufficient: false,
      validatedChunks: [],
      rejectedChunks,
      conflictsDetected,
      reason:
        processedQuery.responseLanguage === 'ar'
          ? 'لم تستوفِ أي مقاطع من المصادر المعتمدة عتبة الصلة والموثوقية المطلوبة.'
          : 'No sufficiently relevant, allowlist-verified passages met the evidence threshold.',
    };
  }

  return {
    isSufficient: true,
    validatedChunks,
    rejectedChunks,
    conflictsDetected,
  };
}
