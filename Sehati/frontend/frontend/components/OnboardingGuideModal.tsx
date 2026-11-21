/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowUpLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  Mic,
  Send,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import { Language } from '../types';

interface OnboardingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onSelectSuggestion?: (question: string) => void;
  onStartInteractiveTour?: () => void;
  isGenerating?: boolean;
}

const TOTAL_STEPS = 6;

const EDUCATIONAL_SUGGESTION_EXAMPLES = [
  {
    ar: 'ما هو مرض السكري وما أنواعه الرئيسية؟',
    en: 'What is diabetes and what are its main types?',
  },
  {
    ar: 'ما هو ارتفاع ضغط الدم وما عوامل الخطر الشائعة؟',
    en: 'What is hypertension and what are its common risk factors?',
  },
] as const;

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({
  isOpen,
  onClose,
  lang,
  onSelectSuggestion,
  onStartInteractiveTour,
  isGenerating = false,
}) => {
  const isAr = lang === 'ar';
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStep((prev) => (isAr ? Math.max(0, prev - 1) : Math.min(TOTAL_STEPS - 1, prev + 1)));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((prev) => (isAr ? Math.min(TOTAL_STEPS - 1, prev + 1) : Math.max(0, prev - 1)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAr, onClose]);

  if (!isOpen) return null;

  const isFirstStep = step === 0;
  const isLastStep = step === TOTAL_STEPS - 1;

  const steps = [
    { title: isAr ? 'ابدأ بسؤالك' : 'Ask your question' },
    { title: isAr ? 'ابعت السؤال' : 'Send your question' },
    { title: isAr ? 'استنى الرد لحظات' : 'Wait for the response' },
    { title: isAr ? 'افهم الإجابة' : 'Understand the answer' },
    { title: isAr ? 'راجع المصادر' : 'Review the sources' },
    { title: isAr ? 'كمّل تعلّم' : 'Continue learning' },
  ];

  const current = steps[step];

  const handleTrySuggestion = (question: string) => {
    if (!onSelectSuggestion || isGenerating) return;
    onClose();
    onSelectSuggestion(question);
  };

  const renderVisual = () => {
    switch (step) {
      case 0:
        return (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-2.5">
            <div className="w-full flex items-center gap-2 bg-white dark:bg-[#1e1e1e] px-3.5 py-2.5 rounded-full border-2 border-emerald-500/55 ring-4 ring-emerald-500/10">
              <span className="flex-1 text-xs sm:text-sm text-zinc-400 truncate select-none">
                {isAr ? 'اسأل صحتي...' : 'Ask Sehati...'}
              </span>
              <span
                aria-hidden="true"
                className="p-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/35 shrink-0"
              >
                <Mic className="w-3.5 h-3.5" />
              </span>
              <span
                aria-hidden="true"
                className="p-1.5 bg-emerald-600/35 text-white rounded-full shrink-0"
              >
                <Send className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
              </span>
            </div>
            <div className="flex items-center justify-between text-[0.7rem] text-slate-500 dark:text-zinc-400 px-1">
              <span>{isAr ? 'اكتب هنا' : 'Type here'}</span>
              <span>{isAr ? 'أو سجّل بالمايك' : 'Or use mic'}</span>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-3">
            <div className="w-full flex items-center gap-2 bg-white dark:bg-[#1e1e1e] px-3.5 py-2 rounded-full border border-slate-200 dark:border-zinc-700">
              <span className="flex-1 text-xs text-zinc-800 dark:text-zinc-100 truncate">
                {isAr ? EDUCATIONAL_SUGGESTION_EXAMPLES[0].ar : EDUCATIONAL_SUGGESTION_EXAMPLES[0].en}
              </span>
              <span
                aria-hidden="true"
                className="p-1.5 bg-emerald-600 text-white rounded-full ring-4 ring-emerald-500/20 shrink-0"
              >
                <Send className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
              </span>
            </div>

            <div className="flex justify-start">
              <div className="max-w-[90%] bg-[#f4f4f4] dark:bg-[#262626] text-zinc-900 dark:text-zinc-100 rounded-[18px] px-3.5 py-2 text-xs leading-relaxed">
                {isAr ? EDUCATIONAL_SUGGESTION_EXAMPLES[0].ar : EDUCATIONAL_SUGGESTION_EXAMPLES[0].en}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-2.5">
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-1.5"
                aria-label={isAr ? 'جارٍ استرجاع الأدلة وتوليد الإجابة' : 'Retrieving evidence and generating response'}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-bounce" />
              </div>
              <span className="text-[0.72rem] text-slate-500 dark:text-zinc-400">
                {isAr ? 'صحتي بيجهّز الإجابة...' : 'Preparing answer...'}
              </span>
            </div>

            <div className="w-full flex items-center gap-2 bg-white dark:bg-[#1e1e1e] px-3.5 py-2 rounded-full border border-emerald-500/30">
              <span className="flex-1 text-xs text-zinc-400 truncate select-none">
                {isAr ? 'اسأل صحتي...' : 'Ask Sehati...'}
              </span>
              <Loader2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-spin shrink-0" />
              <span
                aria-hidden="true"
                className="p-1.5 bg-red-600 text-white rounded-full shrink-0"
                title={isAr ? 'إيقاف التوليد' : 'Stop generating'}
              >
                <Square className="w-2.5 h-2.5 fill-current" />
              </span>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-2.5">
            <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-2.5 text-xs">
              <div>
                <p className="font-bold text-slate-900 dark:text-zinc-100">
                  {isAr ? 'المعلومة المباشرة والشرح' : 'Direct answer & explanation'}
                </p>
                <p className="text-[0.72rem] text-slate-500 dark:text-zinc-400 mt-0.5">
                  {isAr
                    ? 'إجابة بسيطة وواضحة على سؤالك، ومعاها شرح إضافي لو متاح.'
                    : 'Clear medical info answering your question, plus details when available.'}
                </p>
              </div>

              <div className="rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 flex items-center justify-between text-slate-700 dark:text-zinc-200">
                <span className="flex items-center gap-1.5 font-semibold text-[0.72rem]">
                  <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span>{isAr ? 'الأدلة المسترجعة (العدد)' : 'Evidence Used (count)'}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>

              <p className="inline-flex items-center gap-1 text-[0.72rem] text-teal-700 dark:text-teal-400 font-medium">
                {isAr ? (
                  <ArrowUpLeft className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{isAr ? 'أسئلة تعليمية مقترحة (لو ظهرت)' : 'Suggested educational questions (when shown)'}</span>
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25 px-3 py-2.5 flex items-start gap-2 text-[0.72rem] text-slate-700 dark:text-zinc-200 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p>
                {isAr
                  ? 'صحتي للتوعية والمعلومات العامة بس؛ مش بيشخّص أمراض ولا يحدد عندك إيه ولا بيكتب علاج أو أدوية.'
                  : 'For general health education only—Sehati does not diagnose conditions, determine what disease you have, or recommend treatments or medications.'}
              </p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-2.5">
            <div className="pb-2 border-b border-slate-200/80 dark:border-zinc-800 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200">
              <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>{isAr ? 'المصادر' : 'Sources'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-900 dark:text-zinc-100">
                {isAr ? 'اسم المصدر' : 'Source Name'}
              </span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-medium underline underline-offset-2">
                <span>{isAr ? 'عنوان المرجع' : 'Document Title'}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-slate-400 tabular-nums">
                {isAr ? 'تاريخ النشر' : 'Publication Date'}
              </span>
            </div>

            <p className="text-[0.72rem] text-slate-500 dark:text-zinc-400 leading-relaxed">
              {isAr
                ? 'المصادر دي هي المراجع اللي اعتمدت عليها الإجابة، وبتظهر تفاصيلها (الاسم والعنوان والتاريخ والرابط) لما تكون متاحة في الرد.'
                : 'These are the retrieved references supporting the answer. Name, title, date, and link appear only when available in the response.'}
            </p>
          </div>
        );

      case 5:
        return (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 p-3.5 space-y-2">
            <p className="text-[0.7rem] font-semibold text-slate-500 dark:text-zinc-400">
              {isAr ? 'جرّب سؤال جاهز (اختياري):' : 'Try a suggested question (optional):'}
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {EDUCATIONAL_SUGGESTION_EXAMPLES.map((item, idx) => {
                const questionText = isAr ? item.ar : item.en;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!onSelectSuggestion || isGenerating}
                    onClick={() => handleTrySuggestion(questionText)}
                    className="inline-flex items-center gap-1.5 text-xs text-start text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-200 hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer py-0.5"
                  >
                    {isAr ? (
                      <ArrowUpLeft className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{questionText}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-guide-title"
        dir={isAr ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-zinc-800 shrink-0 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2
                id="onboarding-guide-title"
                className="text-sm font-bold text-slate-900 dark:text-white truncate"
              >
                {isAr ? 'إزاي تستخدم صحتي؟' : 'How to use Sehati'}
              </h2>
              <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 tabular-nums whitespace-nowrap shrink-0">
                {step + 1} / {TOTAL_STEPS}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'إغلاق' : 'Close'}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Clean 6-step progress bar */}
          <div
            role="tablist"
            aria-label={isAr ? 'خطوات الدليل' : 'Guide steps'}
            className="grid grid-cols-6 gap-1.5"
          >
            {steps.map((s, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === step}
                aria-label={`${idx + 1}. ${s.title}`}
                onClick={() => setStep(idx)}
                className="py-1 cursor-pointer focus:outline-hidden"
              >
                <span
                  className={`block h-1 rounded-full transition-colors duration-150 ${
                    idx <= step
                      ? 'bg-emerald-600 dark:bg-emerald-400'
                      : 'bg-slate-200 dark:bg-zinc-800'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-5 py-4 space-y-3">
          <div>
            <h3 className="text-[0.95rem] font-bold text-slate-900 dark:text-white">
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums me-1.5">
                {step + 1}.
              </span>
              {current.title}
            </h3>
          </div>

          {renderVisual()}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isAr ? 'تخطي' : 'Skip'}
            </button>
            {onStartInteractiveTour && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartInteractiveTour();
                }}
                className="px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isAr ? 'جولة تفاعلية' : 'Live tour'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isFirstStep}
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isAr ? (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isAr ? 'السابق' : 'Previous'}</span>
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{isAr ? 'تمام' : 'Done'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.min(TOTAL_STEPS - 1, prev + 1))}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>{isAr ? 'التالي' : 'Next'}</span>
                {isAr ? (
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
