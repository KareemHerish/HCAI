/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { APPROVED_SOURCES } from '../config/allowlist.js';
import { processRagQuery } from '../pipeline/ragOrchestrator.js';
import { runSemanticSafetyFilter } from '../pipeline/safetyFilter.js';
import { vectorStore } from '../pipeline/vectorStore.js';
import { LlmGenerationError, STRICT_GROUNDED_SYSTEM_PROMPT } from '../pipeline/answerGenerator.js';
import { Language } from '../types.js';

export const chatRouter = Router();

const EMERGENCY_CONTACTS = [
  {
    country: 'مصر (Egypt)',
    code: 'EG',
    ambulance: '123',
    police: '122',
    fire: '180',
    hotline: '137 (طوارئ الصحة)',
    poisonControl: '02-23640248 (مركز السموم بالقصر العيني)',
  },
  {
    country: 'المملكة العربية السعودية (Saudi Arabia)',
    code: 'SA',
    ambulance: '997',
    police: '999',
    fire: '998',
    hotline: '937 (مركز الصحة)',
  },
  {
    country: 'الإمارات العربية المتحدة (UAE)',
    code: 'AE',
    ambulance: '998',
    police: '999',
    fire: '997',
    hotline: '800-342',
  },
  {
    country: 'الأردن (Jordan)',
    code: 'JO',
    ambulance: '911',
    police: '911',
    fire: '911',
    hotline: '111',
  },
  {
    country: 'الولايات المتحدة وكندا (US & Canada)',
    code: 'US',
    ambulance: '911',
    police: '911',
    fire: '911',
    hotline: '988 (Suicide & Crisis Lifeline)',
  },
  {
    country: 'المملكة المتحدة (United Kingdom)',
    code: 'UK',
    ambulance: '999',
    police: '999',
    fire: '999',
    hotline: '111 (NHS non-emergency)',
  },
  {
    country: 'الاتحاد الأوروبي (European Union)',
    code: 'EU',
    ambulance: '112',
    police: '112',
    fire: '112',
    hotline: '116 123',
  },
];

async function handleChat(req: Request, res: Response) {
  const startTime = Date.now();
  const message = req.body?.message || req.body?.text || '';
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const simpleMode = !!req.body?.simpleMode;
  const lang: Language = req.body?.lang === 'en' ? 'en' : 'ar';
  const topK = typeof req.body?.topK === 'number' ? req.body.topK : 3;
  const sourceFilter = Array.isArray(req.body?.sourceFilter) ? req.body.sourceFilter : undefined;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({
      status: 'error',
      reply:
        lang === 'ar'
          ? 'يرجى كتابة سؤال واضح للحصول على معلومات طبية تعليمية.'
          : 'Please provide a valid question for medical education.',
      seconds: 0,
    });
    return;
  }

  const requestAbortController = new AbortController();
  const hardRouteTimeout = setTimeout(() => {
    requestAbortController.abort(new Error('Backend route 30s deadline exceeded'));
  }, 29500);

  const onClose = () => {
    if (!res.writableFinished) {
      requestAbortController.abort(new Error('Client closed connection'));
    }
  };
  res.on('close', onClose);

  try {
    const ragPayload = await processRagQuery({
      message,
      history,
      lang,
      simpleMode,
      topK,
      sourceFilter,
      abortSignal: requestAbortController.signal,
    });

    if (!res.headersSent) {
      res.json(ragPayload);
    }
  } catch (error: any) {
    const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(3));
    const errMsg = error?.message || String(error);
    console.error('Strict RAG chat error:', errMsg);

    const isKeyError =
      errMsg.includes('GEMINI_API_KEY') ||
      errMsg.includes('API_KEY_INVALID') ||
      errMsg.includes('PERMISSION_DENIED');

    const isQuotaError =
      error instanceof LlmGenerationError
        ? error.isQuota
        : errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('429') ||
          errMsg.toLowerCase().includes('quota');

    const isTimeout =
      !isQuotaError &&
      ((error instanceof LlmGenerationError && error.isTimeout) ||
        errMsg.toLowerCase().includes('timeout') ||
        errMsg.toLowerCase().includes('deadline'));

    if (res.headersSent) return;

    const statusCode = isKeyError ? 503 : isQuotaError ? 429 : isTimeout ? 504 : 503;

    const replyAr = isKeyError
      ? 'خدمة التوليد غير متاحة حالياً بسبب إعدادات مفتاح Gemini API في البيئة. يرجى التحقق من Settings > Secrets.'
      : isQuotaError
      ? 'تم الوصول مؤقتاً إلى الحد اليومي أو حد الطلبات المسموح به لخدمة Gemini API. يرجى المحاولة بعد قليل أو مراجعة الحصة في Settings > Secrets.'
      : isTimeout
      ? 'استغرق توليد الإجابة وقتاً أطول من الحد الأقصى المسموح (30 ثانية) على النموذج الأساسي والبديل. يرجى المحاولة مرة أخرى.'
      : 'تعذر إتمام معالجة السؤال عبر النموذج الأساسي والنموذج البديل حالياً. يرجى المحاولة مرة أخرى بعد قليل.';

    const replyEn = isKeyError
      ? 'The grounded generation service is unavailable because GEMINI_API_KEY is not configured in Settings > Secrets.'
      : isQuotaError
      ? 'The Gemini API rate or daily quota limit has been temporarily reached. Please try again shortly or check your API quota in Settings > Secrets.'
      : isTimeout
      ? 'Generating a grounded response exceeded the 30-second limit on both primary and fallback models. Please try again.'
      : 'Unable to generate a grounded response from both primary and fallback models right now. Please try again shortly.';

    res.status(statusCode).json({
      status: 'error',
      language: lang,
      reply: lang === 'ar' ? replyAr : replyEn,
      error: errMsg,
      seconds: elapsedSeconds,
    });
  } finally {
    clearTimeout(hardRouteTimeout);
    res.off('close', onClose);
  }
}

chatRouter.post('/chat', handleChat);
chatRouter.post('/api/chat', handleChat);
chatRouter.post('/api/index', handleChat);

chatRouter.post('/api/transcribe', async (req: Request, res: Response) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio || typeof audio !== 'string') {
      res.status(400).json({ error: 'No audio data provided' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const cleanMime = (mimeType || 'audio/webm').split(';')[0];
    const candidateModels = ['gemini-3.5-transcribe', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
    const transcribeDeadlineMs = Date.now() + 29500;

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const remainingMs = transcribeDeadlineMs - Date.now();
        if (remainingMs <= 1000) {
          res.status(504).json({ error: 'Transcription exceeded the 30-second timeout limit' });
          return;
        }
        const attemptTimeoutMs = Math.min(12000, remainingMs);
        try {
          const result = await Promise.race([
            ai.models.generateContent({
              model,
              contents: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: audio,
                  },
                },
                {
                  text: 'Transcribe this spoken Egyptian Arabic or English audio accurately into plain text. Return ONLY the transcribed text, nothing else.',
                },
              ],
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Transcription timeout')), attemptTimeoutMs)
            ),
          ]);

          const transcript = result.text ? result.text.trim() : '';
          if (transcript) {
            res.json({ transcript });
            return;
          }
        } catch {
          if (attempt === 1 && transcribeDeadlineMs - Date.now() > 1500) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          break;
        }
      }
    }

    res.status(500).json({ error: 'Transcription unavailable' });
  } catch (err: any) {
    console.error('Server transcription error:', err);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

chatRouter.post('/api/test-filter', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const message = req.body?.message || '';
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const lang: Language = req.body?.lang === 'en' ? 'en' : 'ar';

  const filterAbortController = new AbortController();
  const hardFilterTimeout = setTimeout(() => {
    filterAbortController.abort(new Error('Safety filter 30s deadline exceeded'));
  }, 29500);

  try {
    const decision = await runSemanticSafetyFilter(message, history, lang, startTime, {
      deadlineMs: startTime + 29000,
      abortSignal: filterAbortController.signal,
    });
    const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(3));

    const legacyStatus =
      decision.classification.category === 'EMERGENCY'
        ? 'red_flag'
        : decision.allowed
        ? 'safe'
        : 'refused';

    if (!res.headersSent) {
      res.json({
        status: legacyStatus,
        ragStatus: decision.earlyResponse?.status || 'success',
        category: decision.classification.category,
        reply: decision.earlyResponse?.reply || null,
        triggerType: decision.classification.triggerType || 'SAFE_MEDICAL_EDUCATION',
        matchedPattern: decision.classification.matchedPattern || null,
        seconds: elapsedSeconds,
      });
    }
  } catch (err: any) {
    if (!res.headersSent) {
      const isTimeout = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('timeout') || String(err?.message || '').toLowerCase().includes('deadline');
      res.status(isTimeout ? 504 : 503).json({
        status: 'error',
        error: err?.message || 'Safety filter unavailable',
        seconds: Number(((Date.now() - startTime) / 1000).toFixed(3)),
      });
    }
  } finally {
    clearTimeout(hardFilterTimeout);
  }
});

chatRouter.get('/api/rag/stats', (_req: Request, res: Response) => {
  res.json({
    knowledgeBase: vectorStore.getStats(),
    approvedSources: Object.values(APPROVED_SOURCES),
  });
});

chatRouter.get('/api/safety-rules', (_req: Request, res: Response) => {
  res.json({
    systemPrompt: STRICT_GROUNDED_SYSTEM_PROMPT,
    approvedSources: Object.values(APPROVED_SOURCES),
  });
});

chatRouter.get('/api/emergency-contacts', (_req: Request, res: Response) => {
  res.json(EMERGENCY_CONTACTS);
});

chatRouter.get('/api/health', (_req: Request, res: Response) => {
  const stats = vectorStore.getStats();
  res.json({
    status: 'healthy',
    service: 'Health Information Navigator (Strict Medical Education RAG)',
    knowledgeBaseChunks: stats.totalChunks,
    knowledgeBaseDocuments: stats.totalDocuments,
    timestamp: new Date().toISOString(),
  });
});
