/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Pause,
  Play,
  PhoneCall,
  AlertTriangle,
  BookOpen,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  FileText,
  ArrowUpRight,
  ArrowUpLeft,
  Pencil,
  X,
  Send
} from 'lucide-react';
import { ChatMessage, Language } from '../types';

const TTS_SPEED_STORAGE_KEY = 'sehati_tts_speed_v1';
const TTS_SPEEDS = [0.8, 1, 1.25] as const;
type TtsSpeed = (typeof TTS_SPEEDS)[number];

interface MessageItemProps {
  message: ChatMessage;
  lang: Language;
  onSelectFollowUp?: (question: string) => void;
  onEditMessage?: (messageId: string, newText: string) => Promise<void> | void;
  isLoading?: boolean;
}

async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Formats inline markdown like **bold**, *italic*, `code`
 */
const renderFormattedInline = (text: string) => {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const chunk = match[0];
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-bold text-zinc-950 dark:text-zinc-50">
          {chunk.slice(2, -2)}
        </strong>
      );
    } else if (chunk.startsWith('*') && chunk.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-zinc-800 dark:text-zinc-200">
          {chunk.slice(1, -1)}
        </em>
      );
    } else if (chunk.startsWith('`') && chunk.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 font-mono text-xs text-teal-700 dark:text-teal-300"
        >
          {chunk.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
};

/**
 * Formats multiline markdown into paragraphs, lists, headers
 */
const FormattedMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const paragraphs = content.split(/\n\s*\n/);

  return (
    <div className="space-y-3 text-[0.9375rem] sm:text-base leading-[1.8] text-zinc-800 dark:text-zinc-200">
      {paragraphs.map((para, pIdx) => {
        const lines = para.trim().split('\n');

        const isBulletList = lines.every((line) => /^(\* |- |• )/.test(line.trim()));
        const isNumberedList = lines.every((line) => /^\d+\.\s/.test(line.trim()));

        if (isBulletList) {
          return (
            <ul
              key={pIdx}
              className="space-y-1.5 my-2 ps-5 list-disc list-outside marker:text-teal-600 dark:marker:text-teal-400"
            >
              {lines.map((line, lIdx) => {
                const cleanLine = line.trim().replace(/^(\* |- |• )\s*/, '');
                return (
                  <li key={lIdx} className="leading-relaxed">
                    {renderFormattedInline(cleanLine)}
                  </li>
                );
              })}
            </ul>
          );
        }

        if (isNumberedList) {
          return (
            <ol
              key={pIdx}
              className="space-y-1.5 my-2 ps-5 list-decimal list-outside marker:text-teal-600 dark:marker:text-teal-400"
            >
              {lines.map((line, lIdx) => {
                const cleanLine = line.trim().replace(/^\d+\.\s*/, '');
                return (
                  <li key={lIdx} className="leading-relaxed">
                    {renderFormattedInline(cleanLine)}
                  </li>
                );
              })}
            </ol>
          );
        }

        if (lines.length === 1 && /^#{1,4}\s/.test(lines[0])) {
          const headerText = lines[0].replace(/^#{1,4}\s*/, '');
          return (
            <h4 key={pIdx} className="font-bold text-base sm:text-lg text-zinc-950 dark:text-zinc-50 pt-1">
              {renderFormattedInline(headerText)}
            </h4>
          );
        }

        return (
          <p key={pIdx} className="leading-[1.8] my-0">
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderFormattedInline(line)}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  lang,
  onSelectFollowUp,
  onEditMessage,
  isLoading = false,
}) => {
  const isAr = lang === 'ar';
  const isUser = message.sender === 'user';
  const [isCopied, setIsCopied] = useState(false);
  const [isUserCopied, setIsUserCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.text);
  const [ttsState, setTtsState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [ttsSpeed, setTtsSpeed] = useState<TtsSpeed>(() => {
    try {
      const saved = Number(localStorage.getItem(TTS_SPEED_STORAGE_KEY));
      if ((TTS_SPEEDS as readonly number[]).includes(saved)) {
        return saved as TtsSpeed;
      }
    } catch {}
    return 1;
  });
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);
  const speechTokenRef = useRef(0);
  const speechOffsetRef = useRef(0);
  const isOwnSpeechRef = useRef(false);

  useEffect(() => {
    return () => {
      if (isOwnSpeechRef.current && 'speechSynthesis' in window) {
        isOwnSpeechRef.current = false;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const textLength = message.text ? message.text.length : 0;
  const lineCount = message.text ? message.text.split('\n').length : 1;
  const isLongPrompt = textLength > 160 || lineCount > 3;
  const [isCollapsed, setIsCollapsed] = useState(isLongPrompt);

  const handleCopyUserMessage = async () => {
    const ok = await copyTextSafely(message.text);
    if (ok) {
      setIsUserCopied(true);
      setTimeout(() => setIsUserCopied(false), 2000);
    }
  };

  const handleStartEdit = () => {
    if (isLoading) return;
    setEditDraft(message.text);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditDraft(message.text);
    setIsEditing(false);
  };

  const handleSubmitEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = editDraft.trim();
    if (!trimmed || isLoading || !onEditMessage) return;
    setIsEditing(false);
    await onEditMessage(message.id, trimmed);
  };

  // 1. User Message (Right in Arabic RTL, Left in English LTR)
  if (isUser) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="flex justify-start my-3 sm:my-4">
        <div className="relative group max-w-[92%] sm:max-w-[85%] md:max-w-2xl bg-[#f4f4f4] dark:bg-[#262626] text-zinc-900 dark:text-zinc-100 rounded-[24px] px-5 py-3.5 sm:px-6 sm:py-4 shadow-xs transition-all">
          {isEditing ? (
            <form onSubmit={handleSubmitEdit} className="space-y-2.5 min-w-[14rem] sm:min-w-[22rem]">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelEdit();
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitEdit();
                  }
                }}
                rows={3}
                autoFocus
                aria-label={isAr ? 'تعديل الرسالة' : 'Edit message'}
                className="w-full rounded-xl border border-emerald-500/60 bg-white dark:bg-zinc-900 px-3 py-2 text-[0.9375rem] sm:text-base text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 resize-y text-start"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
                </button>
                <button
                  type="submit"
                  disabled={!editDraft.trim() || isLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition-colors cursor-pointer shadow-xs"
                >
                  <Send className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
                  <span>{isAr ? 'تحديث وإرسال' : 'Save & Resubmit'}</span>
                </button>
              </div>
            </form>
          ) : (
            <>
              <div
                className={`text-[0.9375rem] sm:text-base leading-[1.75] text-start font-normal transition-all overflow-hidden ${
                  isLongPrompt && isCollapsed ? 'max-h-24 line-clamp-3' : ''
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-1.5 border-t border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyUserMessage}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 py-1 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title={isAr ? 'نسخ الرسالة' : 'Copy message'}
                    aria-label={isAr ? 'نسخ الرسالة' : 'Copy message'}
                  >
                    {isUserCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 font-semibold">
                          {isAr ? 'تم النسخ' : 'Copied'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[0.6875rem]">{isAr ? 'نسخ' : 'Copy'}</span>
                      </>
                    )}
                  </button>

                  {onEditMessage && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed py-1 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      title={isAr ? 'تعديل وإعادة إرسال' : 'Edit and resubmit'}
                      aria-label={isAr ? 'تعديل الرسالة' : 'Edit message'}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="text-[0.6875rem]">{isAr ? 'تعديل' : 'Edit'}</span>
                    </button>
                  )}
                </div>

                {isLongPrompt && (
                  <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 py-1 px-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    aria-label={isAr ? 'تبديل عرض نص الرسالة' : 'Toggle user message preview'}
                  >
                    <span>
                      {isCollapsed
                        ? isAr
                          ? 'عرض المزيد'
                          : 'Show more'
                        : isAr
                        ? 'عرض أقل'
                        : 'Show less'}
                    </span>
                    {isCollapsed ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 2. Assistant Message (Strict Grounded RAG Structure)
  const rag = message.ragData;
  const effectiveStatus = rag?.status || message.status || 'answered';
  const isEmergency = effectiveStatus === 'red_flag' || effectiveStatus === 'emergency';
  const isRefusal =
    effectiveStatus === 'refused' ||
    effectiveStatus === 'diagnosis_request' ||
    effectiveStatus === 'treatment_request' ||
    effectiveStatus === 'medication_request' ||
    effectiveStatus === 'out_of_scope';
  const isClarification = effectiveStatus === 'clarification_required';
  const isInsufficient = effectiveStatus === 'insufficient_evidence';
  const isGreeting = effectiveStatus === 'greeting';
  const isSuccessRag = effectiveStatus === 'success' && !!rag;
  const isGeneralKnowledge = isSuccessRag && rag?.knowledge_source === 'general_knowledge';
  const isKbGrounded =
    isSuccessRag &&
    !isGeneralKnowledge &&
    (rag?.knowledge_source === 'knowledge_base' || (rag?.sources?.length ?? 0) > 0);

  const textForCopy = rag
    ? [
        rag.answer.direct_answer,
        rag.answer.detailed_explanation &&
        rag.answer.detailed_explanation !== rag.answer.direct_answer
          ? rag.answer.detailed_explanation
          : '',
        rag.answer.educational_disclaimer,
      ]
        .filter(Boolean)
        .join('\n\n')
    : message.text;

  const handleCopy = async () => {
    const ok = await copyTextSafely(textForCopy);
    if (ok) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const cleanTextForSpeech = textForCopy.replace(/[*#`_]/g, '').trim();

  const startSpeakingFromOffset = (offset: number, rate: TtsSpeed) => {
    if (!('speechSynthesis' in window) || !cleanTextForSpeech) return;

    const safeOffset = Math.max(0, Math.min(offset, cleanTextForSpeech.length));
    const slice = cleanTextForSpeech.slice(safeOffset).trim();
    if (!slice) {
      isOwnSpeechRef.current = false;
      speechOffsetRef.current = 0;
      setTtsState('idle');
      return;
    }

    const token = ++speechTokenRef.current;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(slice);
    const hasArabic = /[\u0600-\u06FF]/.test(cleanTextForSpeech);
    const hasEnglish = /[a-zA-Z]/.test(cleanTextForSpeech);

    if (hasEnglish && !hasArabic) {
      utterance.lang = 'en-US';
    } else if (hasArabic) {
      utterance.lang = 'ar-EG';
    } else {
      utterance.lang = isAr ? 'ar-EG' : 'en-US';
    }

    utterance.rate = rate;
    utterance.onboundary = (event) => {
      if (speechTokenRef.current !== token) return;
      if (typeof event.charIndex === 'number') {
        speechOffsetRef.current = safeOffset + event.charIndex;
      }
    };
    utterance.onend = () => {
      if (speechTokenRef.current !== token) return;
      isOwnSpeechRef.current = false;
      speechOffsetRef.current = 0;
      setTtsState('idle');
    };
    utterance.onerror = () => {
      if (speechTokenRef.current !== token) return;
      isOwnSpeechRef.current = false;
      speechOffsetRef.current = 0;
      setTtsState('idle');
    };

    isOwnSpeechRef.current = true;
    setTtsState('playing');
    window.speechSynthesis.speak(utterance);
  };

  const handleStartSpeak = () => {
    speechOffsetRef.current = 0;
    startSpeakingFromOffset(0, ttsSpeed);
  };

  const handleTogglePauseResume = () => {
    if (!('speechSynthesis' in window)) return;

    if (ttsState === 'playing') {
      window.speechSynthesis.pause();
      setTtsState('paused');
      return;
    }

    if (ttsState === 'paused') {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setTtsState('playing');
      } else {
        // Fallback for browsers where pause cancels or fails to resume natively
        startSpeakingFromOffset(speechOffsetRef.current, ttsSpeed);
      }
    }
  };

  const handleStopSpeak = () => {
    speechTokenRef.current += 1;
    isOwnSpeechRef.current = false;
    speechOffsetRef.current = 0;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setTtsState('idle');
  };

  const handleChangeTtsSpeed = (nextSpeed: TtsSpeed) => {
    setTtsSpeed(nextSpeed);
    try {
      localStorage.setItem(TTS_SPEED_STORAGE_KEY, String(nextSpeed));
    } catch {}

    if (ttsState === 'playing') {
      startSpeakingFromOffset(speechOffsetRef.current, nextSpeed);
    } else if (ttsState === 'paused') {
      // Restart paused playback cleanly at new rate when resumed next
      speechTokenRef.current += 1;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      isOwnSpeechRef.current = false;
    }
  };

  const getStatusBannerLabel = () => {
    switch (effectiveStatus) {
      case 'diagnosis_request':
        return isAr
          ? 'قيود الأمان الطبي: لا يُسمح بالتشخيص السريري أو تفسير الأعراض الشخصية.'
          : 'Medical Safety Boundary: Clinical diagnosis and personal symptom evaluation are not permitted.';
      case 'treatment_request':
        return isAr
          ? 'قيود الأمان الطبي: لا يُسمح بوصف خطط علاجية أو إجراءات طبية.'
          : 'Medical Safety Boundary: Treatment plans and personalized clinical interventions are not permitted.';
      case 'medication_request':
        return isAr
          ? 'قيود الأمان الطبي: لا يُسمح بترشيح الأدوية أو تحديد الجرعات الدوائية.'
          : 'Medical Safety Boundary: Medication recommendations and dosage instructions are not permitted.';
      case 'out_of_scope':
        return isAr
          ? 'خارج النطاق: النظام مخصص للتثقيف الطبي والصحي العام فقط.'
          : 'Out of Scope: This assistant is restricted exclusively to general medical education.';
      case 'clarification_required':
        return isAr
          ? 'يرجى التوضيح: حدد الموضوع الطبي العام الذي ترغب في التعرف عليه.'
          : 'Clarification Needed: Please specify the general medical education topic.';
      case 'insufficient_evidence':
        return isAr
          ? 'عدم كفاية الأدلة: لم تتوفر مصادر كافية في قاعدة المعرفة المعتمدة.'
          : 'Insufficient Evidence: Not enough verified evidence found in the approved knowledge base.';
      default:
        return isAr
          ? 'ملاحظة أمان: يقدم صحتي معلومات تثقيفية فقط.'
          : 'Safety Note: Sehati provides general medical education only.';
    }
  };

  const isStreamingMsg = !!message.isStreaming;
  const showSafetyNoticeBanner =
    !isStreamingMsg &&
    (effectiveStatus === 'refused' ||
      effectiveStatus === 'diagnosis_request' ||
      effectiveStatus === 'treatment_request' ||
      effectiveStatus === 'medication_request' ||
      isInsufficient) &&
    !isEmergency;

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex justify-start my-5 sm:my-6 w-full">
      <div data-tour="assistant-response" className="text-start w-full space-y-4">
      {/* 1. Emergency Red Flag Banner */}
      {isEmergency && (() => {
        const answerText = `${rag?.answer?.direct_answer || ''} ${message.text || ''}`;
        const emergencyTarget = /\b997\b/.test(answerText)
          ? { tel: 'tel:997', labelAr: 'إسعاف السعودية 997', labelEn: 'Saudi 997', subAr: 'اطلب خدمات الطوارئ في السعودية (997 / 911) فوراً ولا تعتمد على المحادثة.', subEn: 'Call Saudi emergency services (997 / 911) immediately.' }
          : /\b122\b/.test(answerText)
          ? { tel: 'tel:122', labelAr: 'طوارئ العراق 122', labelEn: 'Iraq 122', subAr: 'اطلب خدمات الطوارئ في العراق (122 / 104) فوراً ولا تعتمد على المحادثة.', subEn: 'Call Iraq emergency services (122 / 104) immediately.' }
          : /\b998\b/.test(answerText)
          ? { tel: 'tel:998', labelAr: 'إسعاف الإمارات 998', labelEn: 'UAE 998', subAr: 'اطلب خدمات الطوارئ في الإمارات (998 / 999) فوراً ولا تعتمد على المحادثة.', subEn: 'Call UAE emergency services (998 / 999) immediately.' }
          : /\b112\b/.test(answerText)
          ? { tel: 'tel:112', labelAr: 'طوارئ 112', labelEn: 'Emergency 112', subAr: 'اطلب رقم الطوارئ (112) فوراً وتوجه لأقرب قسم طوارئ.', subEn: 'Call emergency services (112) immediately.' }
          : /\b911\b/.test(answerText)
          ? { tel: 'tel:911', labelAr: 'طوارئ 911', labelEn: 'Emergency 911', subAr: 'اطلب رقم الطوارئ (911) فوراً وتوجه لأقرب قسم طوارئ.', subEn: 'Call emergency services (911) immediately.' }
          : /\b123\b/.test(answerText)
          ? { tel: 'tel:123', labelAr: 'إسعاف مصر 123', labelEn: 'Egypt 123', subAr: 'اطلب خدمات الطوارئ المحلية فوراً (123 في مصر) ولا تعتمد على المحادثة.', subEn: 'Contact your local emergency number immediately (123 in Egypt) and seek urgent care.' }
          : { tel: 'tel:112', labelAr: 'اتصل بالطوارئ', labelEn: 'Call Emergency', subAr: 'اتصل برقم الطوارئ أو الإسعاف المحلي في بلدك فوراً وتوجه لأقرب قسم طوارئ.', subEn: 'Contact your local emergency ambulance immediately and seek urgent care.' };

        return (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-950 dark:text-red-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-red-800 dark:text-red-200">
                  {isAr ? 'تحذير طوارئ طبية فورية' : 'Immediate Medical Emergency Warning'}
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                  {isAr ? emergencyTarget.subAr : emergencyTarget.subEn}
                </p>
              </div>
            </div>
            <a
              href={emergencyTarget.tel}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors shrink-0 cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-4 h-4" />
              <span>{isAr ? emergencyTarget.labelAr : emergencyTarget.labelEn}</span>
            </a>
          </div>
        );
      })()}

      {/* 2. Clinical Safety Refusal / Insufficient Evidence Notice */}
      {showSafetyNoticeBanner && (
        <div className="px-4 py-2.5 rounded-xl border text-xs flex items-center gap-2.5 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-medium">{getStatusBannerLabel()}</span>
        </div>
      )}

      {/* 3. Structured RAG Answer Body */}
      {rag ? (
        <div className="space-y-4">
          {/* A. Direct Answer */}
          <div className="text-base sm:text-[1.0625rem] font-semibold leading-[1.75] text-zinc-950 dark:text-zinc-50">
            <FormattedMarkdown content={rag.answer.direct_answer} />
          </div>

          {/* B. Detailed Explanation */}
          {rag.answer.detailed_explanation &&
            rag.answer.detailed_explanation !== rag.answer.direct_answer && (
              <div className="pt-1">
                <FormattedMarkdown content={rag.answer.detailed_explanation} />
              </div>
            )}

          {isStreamingMsg && (
            <div className="flex items-center gap-1.5 pt-0.5 text-emerald-600 dark:text-emerald-400">
              <span className="inline-block w-2 h-4 rounded-xs bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            </div>
          )}

          {/* Transparency Notice distinguishing Case A (KB Grounded) vs Case B (General Medical Knowledge) */}
          {!isStreamingMsg && isKbGrounded && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium pt-1">
              {isAr
                ? 'تم إعداد هذا الشرح بناءً على معلومات مسترجعة من قاعدة المعرفة الطبية المعتمدة.'
                : 'This explanation is based on retrieved information from the approved medical Knowledge Base.'}
            </p>
          )}

          {!isStreamingMsg && isGeneralKnowledge && (
            <p className="text-xs text-sky-700 dark:text-sky-400 font-medium pt-1">
              {isAr
                ? 'لم تتوفر مقاطع مطابقة في قاعدة المعرفة المحلية؛ لذلك يعتمد هذا الشرح على المعرفة الطبية التعليمية العامة دون الاستناد إلى مصادر مسترجعة من قاعدة البيانات.'
                : 'No matching passages were found in the local Knowledge Base; this answer comes from general educational medical knowledge without Knowledge Base citations.'}
            </p>
          )}

          {/* Conflict Notice if multiple sources reported differing figures */}
          {!isStreamingMsg && rag.conflicts_noted && rag.conflicts_noted.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">
                {isAr ? 'ملاحظة حول اختلاف الأرقام المرجعية بين المصادر:' : 'Source Reference Note:'}
              </p>
              {rag.conflicts_noted.map((c, idx) => (
                <p key={idx}>{c}</p>
              ))}
            </div>
          )}

          {/* C. Expandable "Evidence Used" Section (KB Grounded Case A only) */}
          {!isStreamingMsg && isKbGrounded && (rag.evidence_used.length > 0 || rag.answer.retrieved_context_summary) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsEvidenceExpanded((prev) => !prev)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>
                    {isAr
                      ? `الأدلة المسترجعة (${rag.evidence_used.length})`
                      : `Evidence Used (${rag.evidence_used.length})`}
                  </span>
                </span>
                {isEvidenceExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {isEvidenceExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-3 text-xs">
                  {/* Readable summary of retrieved passages */}
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                      {isAr ? 'ملخص السياق المسترجع' : 'Retrieved Context Summary'}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {rag.answer.retrieved_context_summary}
                    </p>
                  </div>

                  {/* Individual readable evidence passages */}
                  {rag.evidence_used.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                      {rag.evidence_used.map((ev, idx) => (
                        <div key={ev.chunk_id || idx} className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {ev.source_name}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{ev.title}</span>
                            {ev.publication_date && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{ev.publication_date}</span>
                              </>
                            )}
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {ev.excerpt}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* D. Verified Sources Section */}
          {!isStreamingMsg && rag.sources && rag.sources.length > 0 && (
            <div data-tour="assistant-sources" className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{isAr ? 'المصادر' : 'Sources'}</span>
              </p>
              <ul className="space-y-2">
                {rag.sources.map((src, idx) => (
                  <li
                    key={`${src.source_name}-${idx}`}
                    className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {src.source_name}
                      </span>
                      <span aria-hidden="true">·</span>
                      {src.url ? (
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                        >
                          <span>{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {src.title}
                        </span>
                      )}
                      {src.publication_date && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400">{src.publication_date}</span>
                        </>
                      )}
                    </div>
                    {src.evidence && (
                      <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {src.evidence}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* E. Educational Disclaimer (omitted on pure social greetings) */}
          {!isStreamingMsg && !isGreeting && rag.answer.educational_disclaimer && (
            <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-[0.6875rem] text-slate-500 dark:text-slate-400 leading-relaxed">
              {rag.answer.educational_disclaimer}
            </div>
          )}

          {/* F. Suggested Educational Follow-up Questions */}
          {!isStreamingMsg && rag.follow_up_questions && rag.follow_up_questions.length > 0 && onSelectFollowUp && (
            <div data-tour="assistant-followups" className="pt-1 space-y-1.5">
              <p className="text-[0.6875rem] font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'أسئلة تعليمية مقترحة:' : 'Suggested educational follow-up questions:'}
              </p>
              <div className="flex flex-col items-start gap-1.5">
                {rag.follow_up_questions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectFollowUp(q)}
                    className="inline-flex items-center gap-1.5 text-xs text-start text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-200 hover:underline transition-colors cursor-pointer py-0.5"
                  >
                    {isAr ? (
                      <ArrowUpLeft className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Legacy plain-text message fallback */
        <div className="w-full">
          <FormattedMarkdown content={message.text} />
          {isStreamingMsg && (
            <div className="flex items-center gap-1.5 pt-1 text-emerald-600 dark:text-emerald-400">
              <span className="inline-block w-2 h-4 rounded-xs bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            </div>
          )}
        </div>
      )}

      {message.wasStopped && !isStreamingMsg && rag && (
        <p className="text-[0.6875rem] font-medium text-amber-600 dark:text-amber-400">
          {isAr ? 'تم إيقاف التوليد بناءً على طلبك.' : 'Generation stopped at your request.'}
        </p>
      )}

      {/* Subtle Bottom Action Bar (Copy, TTS with Pause/Resume & Speed, Response Time) */}
      {!isStreamingMsg && (
      <div className="pt-1 flex flex-wrap items-center gap-2 text-zinc-400 dark:text-zinc-500">
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-lg hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
          title={isAr ? 'نسخ' : 'Copy'}
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span className="text-[0.6875rem] text-teal-600 dark:text-teal-400 font-medium">
                {isAr ? 'تم النسخ' : 'Copied'}
              </span>
            </>
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        {ttsState === 'idle' ? (
          <button
            type="button"
            onClick={handleStartSpeak}
            className="p-1.5 rounded-lg hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title={isAr ? 'استماع' : 'Listen'}
            aria-label={isAr ? 'استماع' : 'Listen'}
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={handleTogglePauseResume}
              className="px-2 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
              title={
                ttsState === 'playing'
                  ? isAr
                    ? 'إيقاف مؤقت'
                    : 'Pause'
                  : isAr
                  ? 'متابعة القراءة'
                  : 'Resume'
              }
              aria-label={
                ttsState === 'playing'
                  ? isAr
                    ? 'إيقاف مؤقت'
                    : 'Pause'
                  : isAr
                  ? 'متابعة القراءة'
                  : 'Resume'
              }
            >
              {ttsState === 'playing' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span className="text-[0.6875rem]">{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span className="text-[0.6875rem]">{isAr ? 'متابعة' : 'Resume'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleStopSpeak}
              className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer flex items-center gap-1 text-xs"
              title={isAr ? 'إيقاف القراءة' : 'Stop reading'}
              aria-label={isAr ? 'إيقاف القراءة' : 'Stop reading'}
            >
              <VolumeX className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TTS Reading Speed Control (0.8x / 1x / 1.25x) */}
        <div
          role="group"
          aria-label={isAr ? 'سرعة القراءة الصوتية' : 'Reading speed'}
          className="inline-flex items-center rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-0.5"
        >
          {TTS_SPEEDS.map((speed) => {
            const active = ttsSpeed === speed;
            return (
              <button
                key={speed}
                type="button"
                onClick={() => handleChangeTtsSpeed(speed)}
                aria-pressed={active}
                className={`px-1.5 py-0.5 rounded-md text-[0.625rem] font-mono tabular-nums transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
                title={isAr ? `سرعة القراءة ${speed}x` : `Reading speed ${speed}x`}
              >
                {speed}x
              </button>
            );
          })}
        </div>

        {message.seconds !== undefined && (
          <span className="text-[0.625rem] text-zinc-400 font-mono tabular-nums ms-1">
            {message.seconds}s
          </span>
        )}
      </div>
      )}
      </div>
    </div>
  );
};
