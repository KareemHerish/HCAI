/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { EmergencyDirectoryView } from './components/EmergencyDirectoryView';
import { PatientGuideView } from './components/PatientGuideView';
import { AppearanceModal } from './components/AppearanceModal';
import { OnboardingGuideModal } from './components/OnboardingGuideModal';
import { InteractiveGuidedTour } from './components/InteractiveGuidedTour';
import {
  API_TIMEOUT_MS,
  ChatMessage,
  ChatSession,
  FONT_SCALE_STEPS,
  FontFamily,
  FontScale,
  Language,
  PageTheme,
  RagStructuredData,
} from './types';
import {
  buildClarificationFallbackMessage,
  isChatbotOutputTooVague,
  VagueChatbotOutputError,
} from './utils/chatResponseGuard';
import { HelpCircle } from 'lucide-react';

const SESSIONS_KEY = 'sehati_chat_sessions_v1';
const SIDEBAR_STATE_KEY = 'sehati_sidebar_open_v1';
const FONT_SCALE_KEY = 'sehati_font_scale_v1';
const FONT_FAMILY_KEY = 'sehati_font_family_v1';
const GUIDED_TOUR_DONE_KEY = 'sehati_guided_tour_v1_done';
const FRONTEND_CHAT_TIMEOUT_MS = API_TIMEOUT_MS;
const createSessionId = () =>
  `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const TAB_ORDER: Record<'chat' | 'emergency' | 'guide', number> = {
  chat: 0,
  emergency: 1,
  guide: 2,
};

const TAB_PANEL_TRANSITION = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const,
};

const CHAT_SWITCH_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'emergency' | 'guide'>('chat');
  const [chatSwitchKey, setChatSwitchKey] = useState(0);
  const [lang, setLang] = useState<Language>('ar');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [pendingSessionIds, setPendingSessionIds] = useState<Set<string>>(() => new Set());
  const [isStreaming, setIsStreaming] = useState(false);
  const isLoading = Boolean(currentSessionId && pendingSessionIds.has(currentSessionId));
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);
  const [isTipsModalOpen, setIsTipsModalOpen] = useState(false);
  const [isGuidedTourOpen, setIsGuidedTourOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GUIDED_TOUR_DONE_KEY) !== 'true';
    } catch {
      return false;
    }
  });
  const [guidedTourStep, setGuidedTourStep] = useState<number>(0);
  const [tourDraft, setTourDraft] = useState<{ text: string; seq: number } | null>(null);
  const [mountedTabs, setMountedTabs] = useState<{ emergency: boolean; guide: boolean }>({
    emergency: false,
    guide: false,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (saved !== null) {
        return typeof window !== 'undefined' && window.innerWidth < 768 ? false : saved === 'true';
      }
      return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
    } catch {
      return true;
    }
  });

  // Pre-mount lightweight secondary tabs once the main UI has painted so even the very first tab switch is 0ms
  useEffect(() => {
    const mountAll = () => setMountedTabs({ emergency: true, guide: true });
    if (typeof window === 'undefined') return;
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    const cic = (window as unknown as {
      cancelIdleCallback?: (id: number) => void;
    }).cancelIdleCallback;

    if (typeof ric === 'function') {
      const id = ric(mountAll, { timeout: 600 });
      return () => cic?.(id);
    }
    const timer = window.setTimeout(mountAll, 150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab === 'emergency' && !mountedTabs.emergency) {
      setMountedTabs((prev) => ({ ...prev, emergency: true }));
    } else if (activeTab === 'guide' && !mountedTabs.guide) {
      setMountedTabs((prev) => ({ ...prev, guide: true }));
    }
  }, [activeTab, mountedTabs.emergency, mountedTabs.guide]);

  const currentSessionIdRef = useRef<string | null>(null);
  const clearEpochRef = useRef(0);
  const sessionAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sessionSeqMapRef = useRef<Map<string, number>>(new Map());
  const pendingContextMapRef = useRef<
    Map<
      string,
      {
        sessionId: string;
        seqId: number;
        optimisticMessages: ChatMessage[];
        titleCandidate: string;
        isEditingFirstMessage: boolean;
        requestIsAr: boolean;
      }
    >
  >(new Map());
  const streamTimerRef = useRef<number | null>(null);
  const activeStreamContextRef = useRef<{
    sessionId: string;
    seqId: number;
    optimisticMessages: ChatMessage[];
    titleCandidate: string;
    isEditingFirstMessage: boolean;
    fullAssistantMessage: ChatMessage;
    currentAssistantMessage: ChatMessage | null;
    requestIsAr: boolean;
  } | null>(null);

  const selectCurrentSessionId = useCallback((id: string | null) => {
    currentSessionIdRef.current = id;
    setCurrentSessionId(id);
  }, []);

  const markSessionPending = useCallback((sessionId: string, pending: boolean) => {
    setPendingSessionIds((prev) => {
      const has = prev.has(sessionId);
      if (pending === has) return prev;
      const next = new Set(prev);
      if (pending) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }, []);

  const handleSetIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>> = (action) => {
    setIsSidebarOpen((prev) => {
      const nextVal = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem(SIDEBAR_STATE_KEY, String(nextVal));
      } catch (e) {
        console.error('Error saving sidebar state:', e);
      }
      return nextVal;
    });
  };

  const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
    try {
      const saved = localStorage.getItem(FONT_FAMILY_KEY) as FontFamily | null;
      return saved && ['cairo', 'alexandria', 'amiri', 'system'].includes(saved) ? saved : 'cairo';
    } catch {
      return 'cairo';
    }
  });

  const [fontScale, setFontScale] = useState<FontScale>(() => {
    try {
      const saved = Number(localStorage.getItem(FONT_SCALE_KEY));
      if ((FONT_SCALE_STEPS as readonly number[]).includes(saved)) {
        return saved as FontScale;
      }
    } catch {}
    return 100;
  });

  const [pageTheme, setPageTheme] = useState<PageTheme>('light');
  const [simpleMode, setSimpleMode] = useState<boolean>(false);

  const isAr = lang === 'ar';

  useEffect(() => {
    document.title = isAr ? 'صحتي' : 'Sehati';
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = '/logo.png';
  }, [isAr]);

  // Global centralized root font scaling & theme/direction sync
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`;
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } catch {}
  }, [fontScale]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
    } catch {}
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    const isDark = pageTheme === 'dark' || pageTheme === 'high-contrast';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [lang, isAr, pageTheme]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw) {
        const parsed: ChatSession[] = JSON.parse(raw);
        const valid = parsed.filter((s) => Array.isArray(s.messages) && s.messages.length > 0);
        if (valid.length > 0) {
          setSessions(valid);
          const latest = valid[0];
          selectCurrentSessionId(latest.id);
          setMessages(latest.messages);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading chat history:', e);
    }

    const newSessionId = createSessionId();
    selectCurrentSessionId(newSessionId);
    setMessages([]);
  }, [selectCurrentSessionId]);

  const clearStreamTimer = useCallback(() => {
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearStreamTimer();
      sessionAbortControllersRef.current.forEach((ctrl) => ctrl.abort());
      sessionAbortControllersRef.current.clear();
    };
  }, [clearStreamTimer]);

  const upsertSessionMessages = useCallback(
    (
      targetSessionId: string | null,
      finalMessages: ChatMessage[],
      firstUserTitleCandidate: string,
      forceUpdateTitle = false
    ) => {
      if (!targetSessionId) return;
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === targetSessionId);
        const updated = exists
          ? prev.map((s) => {
              if (s.id !== targetSessionId) return s;
              const isFirstUserMsg =
                forceUpdateTitle || s.messages.filter((m) => m.sender === 'user').length === 0;
              return {
                ...s,
                title: isFirstUserMsg ? firstUserTitleCandidate : s.title,
                messages: finalMessages,
                updatedAt: Date.now(),
              };
            })
          : [
              {
                id: targetSessionId,
                title: firstUserTitleCandidate,
                messages: finalMessages,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              ...prev,
            ];

        try {
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error('Error saving chat history:', e);
        }
        return updated;
      });
    },
    []
  );

  // When switching away from a chat that is actively streaming, save its complete answer
  // immediately to that session without aborting any background in-flight network requests.
  const flushActiveStreamToSession = useCallback(() => {
    const streamCtx = activeStreamContextRef.current;
    clearStreamTimer();
    activeStreamContextRef.current = null;
    setIsStreaming(false);

    if (streamCtx) {
      const completedMessages = [
        ...streamCtx.optimisticMessages,
        { ...streamCtx.fullAssistantMessage, isStreaming: false },
      ];
      upsertSessionMessages(
        streamCtx.sessionId,
        completedMessages,
        streamCtx.titleCandidate,
        streamCtx.isEditingFirstMessage
      );
    }
  }, [clearStreamTimer, upsertSessionMessages]);

  const abortSessionRequest = useCallback(
    (sessionId: string) => {
      const nextSeq = (sessionSeqMapRef.current.get(sessionId) ?? 0) + 1;
      sessionSeqMapRef.current.set(sessionId, nextSeq);

      const ctrl = sessionAbortControllersRef.current.get(sessionId);
      if (ctrl) {
        ctrl.abort();
        sessionAbortControllersRef.current.delete(sessionId);
      }

      pendingContextMapRef.current.delete(sessionId);
      markSessionPending(sessionId, false);

      if (activeStreamContextRef.current?.sessionId === sessionId) {
        clearStreamTimer();
        activeStreamContextRef.current = null;
        setIsStreaming(false);
      }
    },
    [clearStreamTimer, markSessionPending]
  );

  const abortAllSessionRequests = useCallback(() => {
    clearEpochRef.current += 1;
    clearStreamTimer();
    activeStreamContextRef.current = null;
    sessionAbortControllersRef.current.forEach((ctrl) => ctrl.abort());
    sessionAbortControllersRef.current.clear();
    pendingContextMapRef.current.clear();
    sessionSeqMapRef.current.clear();
    setPendingSessionIds(new Set());
    setIsStreaming(false);
  }, [clearStreamTimer]);

  const handleStopGenerating = () => {
    const activeId = currentSessionIdRef.current;
    if (!activeId) return;

    const streamCtx =
      activeStreamContextRef.current?.sessionId === activeId
        ? activeStreamContextRef.current
        : null;
    const pendingCtx = pendingContextMapRef.current.get(activeId) || null;

    abortSessionRequest(activeId);

    if (streamCtx && streamCtx.currentAssistantMessage) {
      const frozenMessage: ChatMessage = {
        ...streamCtx.currentAssistantMessage,
        isStreaming: false,
        wasStopped: true,
      };
      const stoppedMessages = [...streamCtx.optimisticMessages, frozenMessage];
      setMessages(stoppedMessages);
      upsertSessionMessages(
        activeId,
        stoppedMessages,
        streamCtx.titleCandidate,
        streamCtx.isEditingFirstMessage
      );
    } else if (pendingCtx) {
      const stoppedNotice: ChatMessage = {
        id: `stopped_${Date.now()}`,
        sender: 'assistant',
        text: pendingCtx.requestIsAr ? 'تم إيقاف توليد الإجابة.' : 'Response generation stopped.',
        timestamp: Date.now(),
        status: 'answered',
        wasStopped: true,
      };
      const stoppedMessages = [...pendingCtx.optimisticMessages, stoppedNotice];
      setMessages(stoppedMessages);
      upsertSessionMessages(
        activeId,
        stoppedMessages,
        pendingCtx.titleCandidate,
        pendingCtx.isEditingFirstMessage
      );
    }
  };

  const markGuidedTourDone = useCallback(() => {
    setIsGuidedTourOpen(false);
    try {
      localStorage.setItem(GUIDED_TOUR_DONE_KEY, 'true');
    } catch {}
  }, []);

  const handleRestartGuidedTour = useCallback(() => {
    setActiveTab('chat');
    setGuidedTourStep(0);
    setIsGuidedTourOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      handleSetIsSidebarOpen(true);
    }
  }, []);

  const handleTourInputChange = useCallback(
    (value: string) => {
      if (!isGuidedTourOpen) return;
      const hasText = value.trim().length > 0;
      if (guidedTourStep === 1 && hasText) {
        setGuidedTourStep(2);
      } else if (guidedTourStep === 2 && !hasText && !isLoading && !isStreaming) {
        setGuidedTourStep(1);
      }
    },
    [isGuidedTourOpen, guidedTourStep, isLoading, isStreaming]
  );

  // Advance tour automatically as the user submits a question and receives the assistant response
  useEffect(() => {
    if (!isGuidedTourOpen || activeTab !== 'chat') return;

    if ((isLoading || isStreaming) && guidedTourStep <= 2) {
      setGuidedTourStep(3);
      return;
    }

    if (!isLoading && !isStreaming && guidedTourStep === 3) {
      const latest = messages[messages.length - 1];
      if (latest && latest.sender === 'assistant') {
        setGuidedTourStep(4);
      }
    }
  }, [isGuidedTourOpen, activeTab, isLoading, isStreaming, guidedTourStep, messages]);

  const handleNewChat = () => {
    flushActiveStreamToSession();
    setTourDraft(null);
    const newSessionId = createSessionId();
    selectCurrentSessionId(newSessionId);
    setMessages([]);
    setChatSwitchKey((k) => k + 1);
    setActiveTab('chat');
    if (isGuidedTourOpen && guidedTourStep === 0) {
      setGuidedTourStep(1);
    }
  };

  const handleSelectSession = (id: string) => {
    if (id !== currentSessionIdRef.current) {
      flushActiveStreamToSession();
    }
    const found = sessions.find((s) => s.id === id);
    if (found) {
      if (found.id !== currentSessionIdRef.current) {
        setChatSwitchKey((k) => k + 1);
      }
      selectCurrentSessionId(found.id);
      setMessages(found.messages);
      setActiveTab('chat');
    }
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    abortSessionRequest(id);

    let nextSessionAfterDelete: ChatSession | null = null;
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      nextSessionAfterDelete = updated[0] ?? null;
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Error saving chat history:', err);
      }
      return updated;
    });

    if (currentSessionIdRef.current === id) {
      const fallback = nextSessionAfterDelete ?? sessions.find((s) => s.id !== id) ?? null;
      if (fallback) {
        selectCurrentSessionId(fallback.id);
        setMessages(fallback.messages);
        setChatSwitchKey((k) => k + 1);
        setActiveTab('chat');
      } else {
        handleNewChat();
      }
    }
  };

  const handleClearAllSessions = () => {
    abortAllSessionRequests();
    try {
      localStorage.removeItem(SESSIONS_KEY);
    } catch {}
    setSessions([]);
    const newSessionId = createSessionId();
    selectCurrentSessionId(newSessionId);
    setMessages([]);
    setChatSwitchKey((k) => k + 1);
    setActiveTab('chat');
  };

  const toggleLang = () => {
    setLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const toggleTheme = () => {
    setPageTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const executeChatRequest = async (
    queryText: string,
    priorMessages: ChatMessage[],
    optimisticMessages: ChatMessage[],
    isEditingFirstMessage = false
  ) => {
    const targetSessionId = currentSessionIdRef.current || createSessionId();
    if (!currentSessionIdRef.current) {
      selectCurrentSessionId(targetSessionId);
    }

    const clearEpoch = clearEpochRef.current;
    const seqId = (sessionSeqMapRef.current.get(targetSessionId) ?? 0) + 1;
    sessionSeqMapRef.current.set(targetSessionId, seqId);

    sessionAbortControllersRef.current.get(targetSessionId)?.abort();
    const controller = new AbortController();
    sessionAbortControllersRef.current.set(targetSessionId, controller);

    const isRequestCurrent = () =>
      clearEpochRef.current === clearEpoch &&
      sessionSeqMapRef.current.get(targetSessionId) === seqId;

    let clientTimedOut = false;
    const reqStart = performance.now();

    const clientTimeout = window.setTimeout(() => {
      clientTimedOut = true;
      controller.abort();
    }, FRONTEND_CHAT_TIMEOUT_MS);

    const requestLang = lang;
    const requestIsAr = requestLang === 'ar';
    const titleCandidate =
      queryText.length > 28 ? `${queryText.slice(0, 28)}...` : queryText;

    if (activeStreamContextRef.current?.sessionId === targetSessionId) {
      clearStreamTimer();
      activeStreamContextRef.current = null;
      setIsStreaming(false);
    }

    pendingContextMapRef.current.set(targetSessionId, {
      sessionId: targetSessionId,
      seqId,
      optimisticMessages,
      titleCandidate,
      isEditingFirstMessage,
      requestIsAr,
    });
    markSessionPending(targetSessionId, true);

    if (currentSessionIdRef.current === targetSessionId) {
      setMessages(optimisticMessages);
    }
    // Persist immediately so the started conversation always stays in Recent Chats
    // even if the user clicks New Chat or switches sessions before the reply finishes.
    upsertSessionMessages(targetSessionId, optimisticMessages, titleCandidate, isEditingFirstMessage);

    try {
      // Exclude previously failed error turns (and the failed user turn right before them)
      // so a failed request never poisons subsequent conversation context.
      const cleanPrior: ChatMessage[] = [];
      for (let i = 0; i < priorMessages.length; i++) {
        const msg = priorMessages[i];
        const nextMsg = priorMessages[i + 1];
        if (msg.status === 'error') continue;
        if (msg.sender === 'user' && nextMsg?.sender === 'assistant' && nextMsg?.status === 'error') {
          continue;
        }
        cleanPrior.push(msg);
      }

      const chatHistory = cleanPrior.slice(-25).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const postChatOnce = async () => {
        const resp = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: queryText,
            history: chatHistory,
            simpleMode,
            lang: requestLang,
          }),
        });
        const json = await resp.json().catch(() => null);
        return { resp, json };
      };

      let { resp: response, json: data } = await postChatOnce();

      // Silent recovery retry on transient 502/503 proxy or server-restart hiccups when budget remains
      const elapsedSoFarMs = performance.now() - reqStart;
      if (
        isRequestCurrent() &&
        !controller.signal.aborted &&
        elapsedSoFarMs < FRONTEND_CHAT_TIMEOUT_MS - 12000 &&
        (!data || response.status === 502 || response.status === 503) &&
        data?.status !== 'error'
      ) {
        await new Promise((r) => setTimeout(r, 600));
        if (isRequestCurrent() && !controller.signal.aborted) {
          const retryResult = await postChatOnce();
          response = retryResult.resp;
          data = retryResult.json;
        }
      }

      if (!isRequestCurrent()) return;

      if (!response.ok || !data || data.status === 'error') {
        const statusFallback =
          response.status === 429
            ? requestIsAr
              ? 'تم الوصول مؤقتاً إلى حد الطلبات المسموح به لخدمة Gemini API. يرجى المحاولة بعد قليل.'
              : 'Rate or daily quota limit reached temporarily. Please try again shortly.'
            : response.status === 504
            ? requestIsAr
              ? 'استغرق توليد الإجابة وقتاً أطول من الحد الأقصى المسموح (30 ثانية). يرجى المحاولة مرة أخرى.'
              : 'Response generation exceeded the 30-second server timeout. Please try again.'
            : requestIsAr
            ? 'الخدمة تواجه ضغطاً مؤقتاً حالياً في توليد الرد. يرجى المحاولة مرة أخرى بعد لحظات.'
            : 'The service is experiencing temporary high load. Please try again in a moment.';

        throw new Error(data?.reply || statusFallback);
      }

      const resolvedReplyText =
        (typeof data.reply === 'string' && data.reply.trim()) ||
        (typeof data.answer?.direct_answer === 'string' && data.answer.direct_answer.trim()) ||
        '';

      // Fallback guard: if the chatbot output is empty, overly vague, or guessing user intent,
      // route to the catch handler to trigger a structured clarification response instead of guessing.
      if (isChatbotOutputTooVague(data, resolvedReplyText)) {
        throw new VagueChatbotOutputError(
          'Chatbot output was too vague to answer reliably without clarification.',
          typeof data.seconds === 'number' ? data.seconds : undefined,
          typeof data.model === 'string' ? data.model : undefined
        );
      }

      const ragData: RagStructuredData | undefined = data.answer
        ? {
            status: data.status,
            language: data.language || requestLang,
            category: data.category,
            knowledge_source: data.knowledge_source,
            answer: data.answer,
            sources: Array.isArray(data.sources) ? data.sources : [],
            follow_up_questions: Array.isArray(data.follow_up_questions)
              ? data.follow_up_questions
              : [],
            evidence_used: Array.isArray(data.evidence_used) ? data.evidence_used : [],
            conflicts_noted: data.conflicts_noted,
          }
        : undefined;

      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        sender: 'assistant',
        text: resolvedReplyText,
        timestamp: Date.now(),
        status: data.status || 'answered',
        seconds: data.seconds,
        model: data.model || (requestIsAr ? 'صحتي' : 'Sehati'),
        triggerType: data.triggerType,
        matchedPattern: data.matchedPattern,
        ragData,
      };

      const isEmergencyResponse =
        assistantMessage.status === 'red_flag' || assistantMessage.status === 'emergency';

      const finalCompletedMessages = [...optimisticMessages, { ...assistantMessage, isStreaming: false }];

      // If the user switched to another chat or New Chat while waiting, save the completed reply
      // silently to its original session in history without disrupting the active view.
      if (currentSessionIdRef.current !== targetSessionId) {
        pendingContextMapRef.current.delete(targetSessionId);
        markSessionPending(targetSessionId, false);
        upsertSessionMessages(
          targetSessionId,
          finalCompletedMessages,
          titleCandidate,
          isEditingFirstMessage
        );
        return;
      }

      if (isEmergencyResponse) {
        pendingContextMapRef.current.delete(targetSessionId);
        markSessionPending(targetSessionId, false);
        setIsStreaming(false);
        setMessages(finalCompletedMessages);
        upsertSessionMessages(
          targetSessionId,
          finalCompletedMessages,
          titleCandidate,
          isEditingFirstMessage
        );
        return;
      }

      // Progressive word-boundary streaming reveal of the validated response
      const tokenize = (s: string): string[] => (s ? s.match(/\S+\s*/g) || [s] : []);
      const hasRag = !!assistantMessage.ragData;
      const directFull = hasRag ? assistantMessage.ragData!.answer.direct_answer || '' : assistantMessage.text;
      const detailFull =
        hasRag &&
        assistantMessage.ragData!.answer.detailed_explanation &&
        assistantMessage.ragData!.answer.detailed_explanation !== directFull
          ? assistantMessage.ragData!.answer.detailed_explanation
          : '';

      const directTokens = tokenize(directFull);
      const detailTokens = tokenize(detailFull);
      const totalTokens = directTokens.length + detailTokens.length;

      if (totalTokens <= 3) {
        pendingContextMapRef.current.delete(targetSessionId);
        markSessionPending(targetSessionId, false);
        setIsStreaming(false);
        setMessages(finalCompletedMessages);
        upsertSessionMessages(
          targetSessionId,
          finalCompletedMessages,
          titleCandidate,
          isEditingFirstMessage
        );
        return;
      }

      const tokensPerTick =
        totalTokens <= 30 ? 2 : totalTokens <= 100 ? 4 : totalTokens <= 220 ? 6 : 8;
      const tickMs = 16;

      let revealed = 0;

      const buildPartialMessage = (count: number): ChatMessage => {
        const directCount = Math.min(count, directTokens.length);
        const detailCount = Math.max(0, count - directTokens.length);
        const partialDirect = directTokens.slice(0, directCount).join('');
        const partialDetail = detailTokens.slice(0, detailCount).join('');

        if (hasRag && assistantMessage.ragData) {
          return {
            ...assistantMessage,
            text: [partialDirect, partialDetail].filter(Boolean).join('\n\n'),
            isStreaming: true,
            ragData: {
              ...assistantMessage.ragData,
              answer: {
                ...assistantMessage.ragData.answer,
                direct_answer: partialDirect,
                detailed_explanation: partialDetail,
              },
            },
          };
        }

        return {
          ...assistantMessage,
          text: partialDirect,
          isStreaming: true,
        };
      };

      activeStreamContextRef.current = {
        sessionId: targetSessionId,
        seqId,
        optimisticMessages,
        titleCandidate,
        isEditingFirstMessage,
        fullAssistantMessage: { ...assistantMessage, isStreaming: false },
        currentAssistantMessage: null,
        requestIsAr,
      };

      const stepStream = () => {
        if (!isRequestCurrent() || currentSessionIdRef.current !== targetSessionId) {
          clearStreamTimer();
          return;
        }

        revealed = Math.min(totalTokens, revealed + tokensPerTick);
        if (revealed >= totalTokens) {
          clearStreamTimer();
          activeStreamContextRef.current = null;
          setIsStreaming(false);
          setMessages(finalCompletedMessages);
          upsertSessionMessages(
            targetSessionId,
            finalCompletedMessages,
            titleCandidate,
            isEditingFirstMessage
          );
          return;
        }

        const partialMsg = buildPartialMessage(revealed);
        if (
          activeStreamContextRef.current &&
          activeStreamContextRef.current.sessionId === targetSessionId &&
          activeStreamContextRef.current.seqId === seqId
        ) {
          activeStreamContextRef.current.currentAssistantMessage = partialMsg;
        }
        setMessages([...optimisticMessages, partialMsg]);
      };

      pendingContextMapRef.current.delete(targetSessionId);
      markSessionPending(targetSessionId, false);
      setIsStreaming(true);
      stepStream();
      if (revealed < totalTokens) {
        streamTimerRef.current = window.setInterval(stepStream, tickMs);
      }
    } catch (err: any) {
      if (!isRequestCurrent()) return;

      pendingContextMapRef.current.delete(targetSessionId);
      markSessionPending(targetSessionId, false);
      if (activeStreamContextRef.current?.sessionId === targetSessionId) {
        activeStreamContextRef.current = null;
        setIsStreaming(false);
      }

      const actualElapsedSec = Number(((performance.now() - reqStart) / 1000).toFixed(2));

      if (err instanceof VagueChatbotOutputError) {
        const clarificationMessage = buildClarificationFallbackMessage(
          queryText,
          requestLang,
          err.elapsedSeconds ?? actualElapsedSec,
          err.modelName
        );
        const clarifiedMessages = [...optimisticMessages, clarificationMessage];
        if (currentSessionIdRef.current === targetSessionId) {
          setMessages(clarifiedMessages);
        }
        upsertSessionMessages(
          targetSessionId,
          clarifiedMessages,
          titleCandidate,
          isEditingFirstMessage
        );
        return;
      }

      const isAbortOrTimeout = clientTimedOut || err?.name === 'AbortError';
      const fallbackErrText = isAbortOrTimeout
        ? requestIsAr
          ? 'انتهى الحد الأقصى لوقت الاستجابة (30 ثانية). يرجى المحاولة مرة أخرى.'
          : 'The response exceeded the 30-second limit. Please try again.'
        : err?.message && !/failed to fetch|networkerror/i.test(err.message)
        ? err.message
        : requestIsAr
        ? 'تعذر الاتصال بالخادم حالياً. تأكد من الاتصال وحاول مرة أخرى.'
        : 'Unable to reach the server right now. Please try again.';

      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: fallbackErrText,
        timestamp: Date.now(),
        status: 'error',
        seconds: isAbortOrTimeout ? 30 : actualElapsedSec,
      };
      const errorMessages = [...optimisticMessages, errorMessage];
      if (currentSessionIdRef.current === targetSessionId) {
        setMessages(errorMessages);
      }
      upsertSessionMessages(
        targetSessionId,
        errorMessages,
        titleCandidate,
        isEditingFirstMessage
      );
    } finally {
      window.clearTimeout(clientTimeout);
      if (sessionAbortControllersRef.current.get(targetSessionId) === controller) {
        sessionAbortControllersRef.current.delete(targetSessionId);
      }
      if (isRequestCurrent()) {
        pendingContextMapRef.current.delete(targetSessionId);
        markSessionPending(targetSessionId, false);
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    const activeId = currentSessionIdRef.current;
    const isActivePending = Boolean(
      activeId && (pendingSessionIds.has(activeId) || pendingContextMapRef.current.has(activeId))
    );
    if (!trimmed || isActivePending || isStreaming) return;
    setTourDraft(null);

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    await executeChatRequest(trimmed, messages, updatedMessages, false);
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    const trimmed = newText.trim();
    const activeId = currentSessionIdRef.current;
    const isActivePending = Boolean(
      activeId && (pendingSessionIds.has(activeId) || pendingContextMapRef.current.has(activeId))
    );
    if (!trimmed || isActivePending || isStreaming) return;

    const targetIndex = messages.findIndex(
      (m) => m.id === messageId && m.sender === 'user'
    );
    if (targetIndex === -1) return;

    const priorMessages = messages.slice(0, targetIndex);
    const updatedUserMessage: ChatMessage = {
      ...messages[targetIndex],
      text: trimmed,
      timestamp: Date.now(),
    };

    const truncatedMessages = [...priorMessages, updatedUserMessage];
    const isEditingFirstUserMsg = priorMessages.every((m) => m.sender !== 'user');

    await executeChatRequest(
      trimmed,
      priorMessages,
      truncatedMessages,
      isEditingFirstUserMsg
    );
  };

  const isDarkOrContrast = pageTheme === 'dark' || pageTheme === 'high-contrast';
  const activeTabIndex = TAB_ORDER[activeTab];

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col font-${fontFamily} theme-${pageTheme} ${
        isDarkOrContrast ? 'dark' : ''
      } ${
        pageTheme === 'high-contrast'
          ? 'bg-black text-white'
          : pageTheme === 'dark'
          ? 'bg-slate-950 text-slate-100'
          : pageTheme === 'soft'
          ? 'bg-[#f0fbf6] text-slate-900'
          : 'bg-slate-50 text-slate-900'
      } transition-colors`}
    >
      <Header lang={lang} />

      <main className="flex-1 min-h-0 overflow-hidden relative flex w-full">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onClearAllSessions={handleClearAllSessions}
          lang={lang}
          toggleLang={toggleLang}
          openAppearanceModal={() => setIsAppearanceModalOpen(true)}
          isDark={pageTheme === 'dark'}
          toggleTheme={toggleTheme}
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={() => handleSetIsSidebarOpen((prev) => !prev)}
        />

        <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden relative flex flex-col">
          {!isSidebarOpen && (
            <img
              data-tour="open-sidebar"
              src="/logo.png"
              alt={isAr ? 'شعار صحتي' : 'Sehati Logo'}
              role="button"
              tabIndex={0}
              onClick={() => handleSetIsSidebarOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSetIsSidebarOpen(true);
                }
              }}
              title={isAr ? 'فتح القائمة الجانبية' : 'Open sidebar'}
              className="w-9 h-9 object-contain rounded-lg cursor-pointer hover:scale-105 active:scale-95 transition-transform absolute top-3 start-3 z-30"
            />
          )}

          {/* Help / Onboarding Guide (?) Button */}
          <button
            type="button"
            onClick={() => {
              if (isGuidedTourOpen) {
                markGuidedTourDone();
              }
              setIsTipsModalOpen(true);
            }}
            title={isAr ? 'دليل استخدام صحتي' : 'How to use Sehati'}
            aria-label={isAr ? 'دليل استخدام صحتي' : 'How to use Sehati'}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-400 transition-colors cursor-pointer shadow-xs absolute top-3 end-3 sm:end-4 z-30"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="relative flex-1 min-h-0 w-full overflow-hidden">
            <motion.div
              aria-hidden={activeTab !== 'chat'}
              initial={false}
              animate={
                activeTab === 'chat'
                  ? { opacity: 1, y: 0, scale: 1, visibility: 'visible' as const }
                  : {
                      opacity: 0,
                      y: TAB_ORDER.chat < activeTabIndex ? -18 : 18,
                      scale: 0.988,
                      transitionEnd: { visibility: 'hidden' as const },
                    }
              }
              transition={TAB_PANEL_TRANSITION}
              className={`absolute inset-0 h-full w-full flex items-center justify-center ${
                activeTab === 'chat' ? 'z-10 pointer-events-auto' : 'z-0 pointer-events-none'
              }`}
            >
              <motion.div
                key={chatSwitchKey}
                initial={chatSwitchKey === 0 ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={CHAT_SWITCH_TRANSITION}
                className="h-full w-full flex items-center justify-center"
              >
                <ChatView
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onEditMessage={handleEditMessage}
                  onStopGenerating={handleStopGenerating}
                  isLoading={isLoading}
                  isStreaming={isStreaming}
                  lang={lang}
                  externalDraft={tourDraft}
                  onInputTextChange={handleTourInputChange}
                />
              </motion.div>
            </motion.div>

            {mountedTabs.emergency && (
              <motion.div
                aria-hidden={activeTab !== 'emergency'}
                initial={{
                  opacity: 0,
                  y: 18,
                  scale: 0.988,
                  visibility: activeTab === 'emergency' ? 'visible' : 'hidden',
                }}
                animate={
                  activeTab === 'emergency'
                    ? { opacity: 1, y: 0, scale: 1, visibility: 'visible' as const }
                    : {
                        opacity: 0,
                        y: TAB_ORDER.emergency < activeTabIndex ? -18 : 18,
                        scale: 0.988,
                        transitionEnd: { visibility: 'hidden' as const },
                      }
                }
                transition={TAB_PANEL_TRANSITION}
                className={`absolute inset-0 h-full w-full overflow-y-auto overscroll-y-contain bg-white dark:bg-slate-950 flex flex-col items-center justify-start p-0 ${
                  activeTab === 'emergency' ? 'z-10 pointer-events-auto' : 'z-0 pointer-events-none'
                }`}
              >
                <EmergencyDirectoryView lang={lang} />
              </motion.div>
            )}

            {mountedTabs.guide && (
              <motion.div
                aria-hidden={activeTab !== 'guide'}
                initial={{
                  opacity: 0,
                  y: 18,
                  scale: 0.988,
                  visibility: activeTab === 'guide' ? 'visible' : 'hidden',
                }}
                animate={
                  activeTab === 'guide'
                    ? { opacity: 1, y: 0, scale: 1, visibility: 'visible' as const }
                    : {
                        opacity: 0,
                        y: TAB_ORDER.guide < activeTabIndex ? -18 : 18,
                        scale: 0.988,
                        transitionEnd: { visibility: 'hidden' as const },
                      }
                }
                transition={TAB_PANEL_TRANSITION}
                className={`absolute inset-0 h-full w-full overflow-y-auto overscroll-y-contain bg-white dark:bg-slate-950 flex flex-col items-center justify-start p-0 ${
                  activeTab === 'guide' ? 'z-10 pointer-events-auto' : 'z-0 pointer-events-none'
                }`}
              >
                <PatientGuideView lang={lang} />
              </motion.div>
            )}
          </div>
        </div>
      </main>

      <AppearanceModal
        isOpen={isAppearanceModalOpen}
        onClose={() => setIsAppearanceModalOpen(false)}
        lang={lang}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        fontScale={fontScale}
        setFontScale={setFontScale}
        simpleMode={simpleMode}
        setSimpleMode={setSimpleMode}
      />

      <OnboardingGuideModal
        isOpen={isTipsModalOpen}
        onClose={() => setIsTipsModalOpen(false)}
        lang={lang}
        isGenerating={isLoading || isStreaming}
        onStartInteractiveTour={handleRestartGuidedTour}
        onSelectSuggestion={(question) => {
          setActiveTab('chat');
          void handleSendMessage(question);
        }}
      />

      <InteractiveGuidedTour
        isOpen={isGuidedTourOpen && activeTab === 'chat' && !isTipsModalOpen && !isAppearanceModalOpen}
        stepIndex={guidedTourStep}
        onStepChange={(next) => setGuidedTourStep(next)}
        onComplete={markGuidedTourDone}
        onSkip={markGuidedTourDone}
        lang={lang}
        isSidebarOpen={isSidebarOpen}
        hasSourcesInLatest={Boolean(
          messages.length > 0 &&
            messages[messages.length - 1]?.sender === 'assistant' &&
            (messages[messages.length - 1]?.ragData?.sources?.length ?? 0) > 0
        )}
        hasFollowUpsInLatest={Boolean(
          messages.length > 0 &&
            messages[messages.length - 1]?.sender === 'assistant' &&
            (messages[messages.length - 1]?.ragData?.follow_up_questions?.length ?? 0) > 0
        )}
        onPrefillExample={(exampleText) => {
          setTourDraft({ text: exampleText, seq: Date.now() });
        }}
      />
    </div>
    </MotionConfig>
  );
}
