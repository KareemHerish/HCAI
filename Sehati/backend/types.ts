/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export type Language = 'ar' | 'en';

export type DomainCategory =
  | 'GREETING'
  | 'SAFE_MEDICAL_EDUCATION'
  | 'PERSONAL_DIAGNOSIS_REQUEST'
  | 'TREATMENT_REQUEST'
  | 'MEDICATION_REQUEST'
  | 'OUT_OF_SCOPE'
  | 'EMERGENCY'
  | 'AMBIGUOUS';

export type RagResponseStatus =
  | 'success'
  | 'greeting'
  | 'emergency'
  | 'diagnosis_request'
  | 'treatment_request'
  | 'medication_request'
  | 'out_of_scope'
  | 'clarification_required'
  | 'insufficient_evidence';

export interface KnowledgeChunk {
  chunk_id: string;
  document_id: string;
  text: string;
  source_name: string;
  source_url: string | null;
  title: string;
  section_heading?: string | null;
  language: Language;
  publication_date: string | null;
  keywords?: string[];
  record_id?: string | null;
}

export interface RetrievedChunk extends KnowledgeChunk {
  vectorScore: number;
  bm25Score: number;
  hybridScore: number;
  matchedTerms: string[];
}

export interface EvidenceValidationResult {
  isSufficient: boolean;
  validatedChunks: RetrievedChunk[];
  rejectedChunks: Array<{ chunk_id: string; reason: string }>;
  conflictsDetected: string[];
  reason?: string;
}

export interface ProcessedQuery {
  originalQuery: string;
  normalizedQuery: string;
  retrievalQuery: string;
  detectedLanguage: 'ar' | 'en' | 'mixed';
  responseLanguage: Language;
  expandedTerms: string[];
  topicAnchor: string | null;
}

export type KnowledgeSource = 'knowledge_base' | 'general_knowledge' | 'none';

export const SourceCitationSchema = z.object({
  source_name: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().nullable(),
  publication_date: z.string().nullable().optional(),
  evidence: z.string().min(1),
});

export const AnswerBodySchema = z.object({
  direct_answer: z.string().min(1),
  detailed_explanation: z.string(),
  retrieved_context_summary: z.string().min(1),
  educational_disclaimer: z.string().min(1),
});

export const StructuredRagResponseSchema = z.object({
  status: z.enum([
    'success',
    'greeting',
    'emergency',
    'diagnosis_request',
    'treatment_request',
    'medication_request',
    'out_of_scope',
    'clarification_required',
    'insufficient_evidence',
  ]),
  language: z.enum(['ar', 'en']),
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
  knowledge_source: z.enum(['knowledge_base', 'general_knowledge', 'none']).optional(),
  answer: AnswerBodySchema,
  sources: z.array(SourceCitationSchema),
  follow_up_questions: z.array(z.string()).max(4),
});

export type SourceCitation = z.infer<typeof SourceCitationSchema>;
export type AnswerBody = z.infer<typeof AnswerBodySchema>;
export type StructuredRagResponse = z.infer<typeof StructuredRagResponseSchema>;

export interface ChatTurnHistory {
  role: 'user' | 'model' | 'assistant';
  text: string;
}

export interface RagApiPayload extends StructuredRagResponse {
  // Backward-compatible flat fields for UI & existing callers
  reply: string;
  seconds: number;
  model: string;
  triggerType?: string;
  matchedPattern?: string;
  evidence_used: Array<{
    chunk_id: string;
    source_name: string;
    title: string;
    url: string | null;
    publication_date: string | null;
    excerpt: string;
    relevance_score: number;
  }>;
  conflicts_noted?: string[];
  pipeline_trace: {
    category: DomainCategory;
    detected_language: 'ar' | 'en' | 'mixed';
    retrieved_count: number;
    validated_count: number;
    validation_passed: boolean;
    knowledge_source?: KnowledgeSource;
    classification_source?: 'deterministic_emergency' | 'semantic_llm' | 'heuristic_fallback';
  };
}
