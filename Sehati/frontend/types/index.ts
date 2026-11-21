/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const API_TIMEOUT_MS = 30000;

export type Language = 'ar' | 'en';

export type MessageStatus =
  | 'answered'
  | 'success'
  | 'greeting'
  | 'red_flag'
  | 'emergency'
  | 'refused'
  | 'diagnosis_request'
  | 'treatment_request'
  | 'medication_request'
  | 'out_of_scope'
  | 'clarification_required'
  | 'insufficient_evidence'
  | 'error';

export type FontFamily = 'cairo' | 'alexandria' | 'amiri' | 'system';
export type TextSize = 'normal' | 'large' | 'xlarge';
export const FONT_SCALE_STEPS = [85, 92, 100, 112, 125, 138] as const;
export type FontScale = (typeof FONT_SCALE_STEPS)[number];
export type PageTheme = 'light' | 'dark' | 'high-contrast' | 'soft';

export interface RagSourceCitation {
  source_name: string;
  title: string;
  url: string | null;
  publication_date?: string | null;
  evidence: string;
}

export interface RagEvidenceItem {
  chunk_id: string;
  source_name: string;
  title: string;
  url: string | null;
  publication_date: string | null;
  excerpt: string;
  relevance_score: number;
}

export interface RagAnswerBody {
  direct_answer: string;
  detailed_explanation: string;
  retrieved_context_summary: string;
  educational_disclaimer: string;
}

export interface RagStructuredData {
  status: MessageStatus;
  language: Language;
  category: string;
  knowledge_source?: 'knowledge_base' | 'general_knowledge' | 'none';
  answer: RagAnswerBody;
  sources: RagSourceCitation[];
  follow_up_questions: string[];
  evidence_used: RagEvidenceItem[];
  conflicts_noted?: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  status?: MessageStatus;
  seconds?: number;
  model?: string;
  triggerType?: string;
  matchedPattern?: string;
  ragData?: RagStructuredData;
  citation?: {
    source: string;
    passageAr: string;
    passageEn: string;
  };
  reported?: boolean;
  reportReason?: string;
  isStreaming?: boolean;
  wasStopped?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SafetyCheckResult {
  status: 'safe' | 'red_flag' | 'refused';
  ragStatus?: string;
  category?: string;
  reply: string | null;
  triggerType?: string;
  matchedPattern?: string;
  seconds?: number;
}

export interface EmergencyContact {
  country: string;
  countryEn: string;
  code: string;
  ambulance: string;
  police: string;
  fire: string;
  hotline?: string;
  poisonControl?: string;
}

export interface TriageLevel {
  level: number;
  titleAr: string;
  titleEn: string;
  color: string;
  bgLight: string;
  border: string;
  actionAr: string;
  actionEn: string;
  examplesAr: string[];
  examplesEn: string[];
}
