/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatTurnHistory, Language, RagApiPayload } from '../types.js';
import {
  generateGeneralEducationalAnswer,
  generateGroundedAnswer,
  generateUnifiedSemanticResponse,
  GenerateAnswerOptions,
  hasConfiguredGeminiKey,
  LLM_TIMEOUT_LIMITS,
} from './answerGenerator.js';
import { buildGroundedContext } from './contextBuilder.js';
import {
  checkImmediateEmergency,
  SemanticClassifierOptions,
} from './domainClassifier.js';
import { validateEvidence } from './evidenceValidator.js';
import { processQuery } from './queryProcessor.js';
import {
  buildInsufficientEvidencePayload,
  validateAndAssembleGeneralKnowledgeResponse,
  validateAndAssembleResponse,
} from './responseValidator.js';
import {
  buildSafetyEarlyDecision,
  runSemanticSafetyFilter,
} from './safetyFilter.js';
import { vectorStore } from './vectorStore.js';

export interface RagRequestOptions {
  message: string;
  history?: ChatTurnHistory[];
  lang?: Language;
  simpleMode?: boolean;
  topK?: number;
  sourceFilter?: string[];
  abortSignal?: AbortSignal;
  _testClassifierOverrides?: SemanticClassifierOptions['_testOverrides'];
  _testGeneratorOverrides?: GenerateAnswerOptions['_testOverrides'];
}

/**
 * Executes the Medical Education RAG + Universal Semantic Gate pipeline:
 * 1. Instant deterministic emergency check (<1ms)
 * 2. Local Hybrid Vector + BM25 Retrieval & Evidence Validation (<15ms)
 * 3. Fast Single-Pass Semantic Gate + Grounded RAG (Case A) / General Knowledge (Case B) / Greeting / Dynamic Out-of-Scope
 * 4. Post-Generation Validation & Strict <=30s Deadline + Automatic Model Fallback
 */
export async function processRagQuery(options: RagRequestOptions): Promise<RagApiPayload> {
  const startTime = Date.now();
  const totalBudgetMs = Math.min(
    options._testGeneratorOverrides?.totalBudgetMs ?? LLM_TIMEOUT_LIMITS.TOTAL_RESPONSE_BUDGET_MS,
    30000
  );
  const deadlineMs = startTime + totalBudgetMs;

  const message = (options.message || '').trim();
  const history = Array.isArray(options.history) ? options.history : [];
  const uiLang: Language = options.lang === 'en' ? 'en' : 'ar';

  // Fast Path: When no explicit split-step test mocks are active and Gemini API is configured,
  // run emergency pre-check + local KB retrieval (<15ms) -> ONE single fast semantic + generation LLM call!
  const useSinglePassUnified =
    !options._testClassifierOverrides &&
    !options._testGeneratorOverrides &&
    hasConfiguredGeminiKey();

  if (useSinglePassUnified) {
    // 1. Instant life-safety emergency check (only emergencies bypass LLM; all social/greeting/thanks/dialectal messages are understood by the model)
    const immediateEmergency = checkImmediateEmergency(message, history);
    if (immediateEmergency) {
      return buildSafetyEarlyDecision(message, immediateEmergency, uiLang, startTime).earlyResponse!;
    }

    if (!message) {
      return buildSafetyEarlyDecision(
        message,
        {
          category: 'AMBIGUOUS',
          triggerType: 'Empty Query',
          isEgyptConfirmed: false,
          confidence: 1,
          classificationSource: 'heuristic_fallback',
        },
        uiLang,
        startTime
      ).earlyResponse!;
    }

    // 2. Local Hybrid Retrieval & Evidence Validation (<15ms in-memory)
    const processedQuery = processQuery(message, history, uiLang);
    const retrievedChunks = await vectorStore.retrieve(processedQuery, {
      topK: options.topK ?? 3,
      relevanceThreshold: 0.24,
      sourceFilter: options.sourceFilter,
      preferredLanguage: uiLang,
    });
    const evidenceCheck = validateEvidence(retrievedChunks, processedQuery);
    const builtContext = evidenceCheck.isSufficient
      ? buildGroundedContext(processedQuery, evidenceCheck, history)
      : null;

    // 3. ONE unified semantic evaluation + response generation call
    const { raw, usedModel } = await generateUnifiedSemanticResponse({
      processedQuery,
      evidenceCheck,
      builtContextBlock: builtContext?.contextBlock ?? null,
      history,
      outputLanguage: uiLang,
      simpleMode: !!options.simpleMode,
      options: {
        deadlineMs,
        abortSignal: options.abortSignal,
      },
    });

    // Greeting / Out-of-Scope / Safety Refusal / Emergency / Ambiguous
    if (raw.category !== 'SAFE_MEDICAL_EDUCATION') {
      const decision = buildSafetyEarlyDecision(
        message,
        {
          category: raw.category,
          triggerType: raw.reason,
          reason: raw.reason,
          dynamicResponse: raw.direct_answer?.trim() || undefined,
          dynamicFollowUps:
            Array.isArray(raw.follow_up_questions) && raw.follow_up_questions.length > 0
              ? raw.follow_up_questions
              : undefined,
          isEgyptConfirmed: Boolean(raw.is_egypt_mentioned),
          confidence: 0.98,
          classificationSource: 'semantic_llm',
        },
        uiLang,
        startTime,
        usedModel
      );
      if (decision.earlyResponse) {
        return decision.earlyResponse;
      }
    }

    // SAFE_MEDICAL_EDUCATION -> Case A (KB Grounded) vs Case B (General Medical Education) vs Insufficient Evidence
    if (raw.response_mode === 'insufficient_evidence') {
      return buildInsufficientEvidencePayload(
        processedQuery,
        startTime,
        undefined,
        usedModel,
        'semantic_llm'
      );
    }

    if (raw.response_mode === 'kb_grounded' && evidenceCheck.isSufficient) {
      return validateAndAssembleResponse(
        {
          has_sufficient_evidence: true,
          direct_answer: raw.direct_answer,
          detailed_explanation: raw.detailed_explanation,
          retrieved_context_summary: raw.retrieved_context_summary,
          cited_evidence: raw.cited_evidence,
          follow_up_questions: raw.follow_up_questions,
        },
        evidenceCheck.validatedChunks,
        processedQuery,
        usedModel,
        startTime,
        evidenceCheck.conflictsDetected,
        retrievedChunks.length,
        'semantic_llm'
      );
    }

    return validateAndAssembleGeneralKnowledgeResponse(
      {
        has_reliable_answer: true,
        direct_answer: raw.direct_answer,
        detailed_explanation: raw.detailed_explanation,
        follow_up_questions: raw.follow_up_questions,
      },
      processedQuery,
      usedModel,
      startTime,
      retrievedChunks.length,
      'semantic_llm'
    );
  }

  // Split-step path (for unit tests with mock overrides or offline CLI mode without API key)
  const safetyDecision = await runSemanticSafetyFilter(message, history, uiLang, startTime, {
    deadlineMs,
    abortSignal: options.abortSignal,
    _testOverrides: options._testClassifierOverrides,
  });
  if (!safetyDecision.allowed && safetyDecision.earlyResponse) {
    return safetyDecision.earlyResponse;
  }

  const classificationSource = safetyDecision.classification.classificationSource;
  const processedQuery = processQuery(message, history, uiLang);

  const retrievedChunks = await vectorStore.retrieve(processedQuery, {
    topK: options.topK ?? 5,
    relevanceThreshold: 0.24,
    sourceFilter: options.sourceFilter,
    preferredLanguage: uiLang,
  });

  const evidenceCheck = validateEvidence(retrievedChunks, processedQuery);

  if (evidenceCheck.isSufficient) {
    const builtContext = buildGroundedContext(processedQuery, evidenceCheck, history);

    const { raw, usedModel } = await generateGroundedAnswer(
      builtContext,
      uiLang,
      !!options.simpleMode,
      {
        deadlineMs,
        abortSignal: options.abortSignal,
        _testOverrides: options._testGeneratorOverrides,
      }
    );

    if (raw.has_sufficient_evidence) {
      return validateAndAssembleResponse(
        raw,
        evidenceCheck.validatedChunks,
        processedQuery,
        usedModel,
        startTime,
        evidenceCheck.conflictsDetected,
        retrievedChunks.length,
        classificationSource
      );
    }

    if (deadlineMs - Date.now() <= 400) {
      return buildInsufficientEvidencePayload(
        processedQuery,
        startTime,
        undefined,
        usedModel,
        classificationSource
      );
    }
  }

  const { raw: generalRaw, usedModel: generalModel } = await generateGeneralEducationalAnswer(
    processedQuery,
    history,
    uiLang,
    !!options.simpleMode,
    {
      deadlineMs,
      abortSignal: options.abortSignal,
      _testOverrides: options._testGeneratorOverrides,
    }
  );

  return validateAndAssembleGeneralKnowledgeResponse(
    generalRaw,
    processedQuery,
    generalModel,
    startTime,
    retrievedChunks.length,
    classificationSource
  );
}
