/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { Language } from '../types';

export type TourStepId =
  | 'new-chat'
  | 'chat-input'
  | 'send-button'
  | 'waiting'
  | 'response'
  | 'continue';

interface InteractiveGuidedTourProps {
  isOpen: boolean;
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
  onComplete: () => void;
  onSkip: () => void;
  lang: Language;
  isSidebarOpen: boolean;
  hasSourcesInLatest: boolean;
  hasFollowUpsInLatest: boolean;
  onPrefillExample?: (exampleText: string) => void;
}

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const TOUR_STEPS: TourStepId[] = [
  'new-chat',
  'chat-input',
  'send-button',
  'waiting',
  'response',
  'continue',
];

const TOUR_CSS = `
@keyframes sehati-tour-flow {
  0% { stroke-dashoffset: 28; }
  100% { stroke-dashoffset: 0; }
}
@keyframes sehati-tour-ring {
  0%, 100% { box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 0 6px rgba(16, 185, 129, 0.16); }
  50% { box-shadow: 0 0 0 2px rgba(5, 150, 105, 1), 0 0 0 9px rgba(16, 185, 129, 0.08); }
}
@keyframes sehati-tour-tip {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(var(--tx, 0px), var(--ty, 0px)); }
}
.sehati-arrow-flow {
  stroke-dasharray: 5 9;
  animation: sehati-tour-flow 1.25s linear infinite;
}
.sehati-target-halo {
  animation: sehati-tour-ring 2s ease-in-out infinite;
}
.sehati-tip-nudge {
  animation: sehati-tour-tip 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .sehati-arrow-flow,
  .sehati-target-halo,
  .sehati-tip-nudge {
    animation: none !important;
  }
}
`;

function findVisibleTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (let i = matches.length - 1; i >= 0; i--) {
      const el = matches[i];
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width > 4 &&
        rect.height > 4 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity || '1') > 0.05
      ) {
        return el;
      }
    }
  }
  return null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const InteractiveGuidedTour: React.FC<InteractiveGuidedTourProps> = ({
  isOpen,
  stepIndex,
  onStepChange,
  onComplete,
  onSkip,
  lang,
  isSidebarOpen,
  hasSourcesInLatest,
  hasFollowUpsInLatest,
  onPrefillExample,
}) => {
  const isAr = lang === 'ar';
  const stepId = TOUR_STEPS[clamp(stepIndex, 0, TOUR_STEPS.length - 1)];
  const cardRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const [cardSize, setCardSize] = useState<{ w: number; h: number }>({ w: 264, h: 120 });

  const targetSelectors = useMemo<string[]>(() => {
    switch (stepId) {
      case 'new-chat':
        return isSidebarOpen
          ? ['[data-tour="new-chat"]', '[data-tour="open-sidebar"]']
          : ['[data-tour="open-sidebar"]', '[data-tour="new-chat"]'];
      case 'chat-input':
        return ['[data-tour="chat-input"]'];
      case 'send-button':
        return ['[data-tour="send-button"]', '[data-tour="chat-input"]'];
      case 'waiting':
        return [
          '[data-tour="waiting-indicator"]',
          '[data-tour="stop-button"]',
          '[data-tour="assistant-response"]',
        ];
      case 'response':
        return hasSourcesInLatest
          ? ['[data-tour="assistant-sources"]', '[data-tour="assistant-response"]']
          : ['[data-tour="assistant-response"]', '[data-tour="chat-input"]'];
      case 'continue':
        return hasFollowUpsInLatest
          ? ['[data-tour="assistant-followups"]', '[data-tour="chat-input"]']
          : ['[data-tour="chat-input"]', '[data-tour="assistant-response"]'];
      default:
        return [];
    }
  }, [stepId, isSidebarOpen, hasSourcesInLatest, hasFollowUpsInLatest]);

  const measure = useCallback(() => {
    if (!isOpen || typeof window === 'undefined') return;
    setViewport({ w: window.innerWidth, h: window.innerHeight });

    const el = findVisibleTarget(targetSelectors);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const r = el.getBoundingClientRect();
    setTargetRect((prev) => {
      if (
        prev &&
        Math.abs(prev.top - r.top) < 0.75 &&
        Math.abs(prev.left - r.left) < 0.75 &&
        Math.abs(prev.width - r.width) < 0.75 &&
        Math.abs(prev.height - r.height) < 0.75
      ) {
        return prev;
      }
      return {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
      };
    });
  }, [isOpen, targetSelectors]);

  useEffect(() => {
    if (!isOpen) return;
    const el = findVisibleTarget(targetSelectors);
    if (el && (stepId === 'response' || stepId === 'continue' || stepId === 'waiting')) {
      const r = el.getBoundingClientRect();
      if (r.top < 56 || r.bottom > window.innerHeight - 56) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isOpen, stepId, targetSelectors]);

  useEffect(() => {
    if (!isOpen) return;
    let rafId: number | null = null;
    const scheduleMeasure = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    measure();
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 320);

    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('scroll', scheduleMeasure, { capture: true, passive: true });

    const observer = new MutationObserver(scheduleMeasure);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden'],
    });

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, { capture: true });
      observer.disconnect();
    };
  }, [isOpen, measure]);

  useLayoutEffect(() => {
    if (!isOpen || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setCardSize((prev) =>
        Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height }
      );
    }
  }, [isOpen, stepIndex, lang, isSidebarOpen, hasSourcesInLatest, hasFollowUpsInLatest]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onSkip]);

  const layout = useMemo(() => {
    const pad = 16;
    const arrowGap = 54;
    const cw = Math.min(cardSize.w || 264, viewport.w - pad * 2);
    const ch = cardSize.h || 120;

    if (!targetRect) {
      return {
        cardLeft: clamp((viewport.w - cw) / 2, pad, viewport.w - cw - pad),
        cardTop: clamp((viewport.h - ch) / 2, pad, viewport.h - ch - pad),
        arrow: null as null | {
          path: string;
          x1: number;
          y1: number;
          x2: number;
          y2: number;
          dartPolygon: string;
          nudgeX: number;
          nudgeY: number;
        },
      };
    }

    const tcx = targetRect.left + targetRect.width / 2;
    const tcy = targetRect.top + targetRect.height / 2;

    type Side = 'left' | 'right' | 'top' | 'bottom';
    let chosenSide: Side = 'bottom';

    const spaceAbove = targetRect.top - pad;
    const spaceBelow = viewport.h - targetRect.bottom - pad;
    const spaceLeft = targetRect.left - pad;
    const spaceRight = viewport.w - targetRect.right - pad;

    if (stepId === 'new-chat') {
      const preferredSide: Side = isAr ? 'left' : 'right';
      const preferredSpace = preferredSide === 'left' ? spaceLeft : spaceRight;
      if (preferredSpace >= cw + arrowGap) {
        chosenSide = preferredSide;
      } else if (spaceBelow >= ch + arrowGap) {
        chosenSide = 'bottom';
      } else {
        chosenSide = 'top';
      }
    } else if (stepId === 'send-button') {
      chosenSide = spaceAbove >= ch + arrowGap ? 'top' : 'bottom';
    } else {
      if (spaceAbove >= ch + arrowGap && spaceAbove >= spaceBelow) {
        chosenSide = 'top';
      } else if (spaceBelow >= ch + arrowGap) {
        chosenSide = 'bottom';
      } else if (spaceAbove >= ch + 28) {
        chosenSide = 'top';
      } else {
        chosenSide = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      }
    }

    let cardLeft = 0;
    let cardTop = 0;

    if (chosenSide === 'left') {
      cardLeft = clamp(targetRect.left - cw - arrowGap, pad, viewport.w - cw - pad);
      cardTop = clamp(tcy - ch / 2 + 10, pad, viewport.h - ch - pad);
    } else if (chosenSide === 'right') {
      cardLeft = clamp(targetRect.right + arrowGap, pad, viewport.w - cw - pad);
      cardTop = clamp(tcy - ch / 2 + 10, pad, viewport.h - ch - pad);
    } else if (chosenSide === 'top') {
      const horizontalBias = stepId === 'send-button' ? (isAr ? 56 : -56) : 0;
      cardLeft = clamp(tcx - cw / 2 + horizontalBias, pad, viewport.w - cw - pad);
      cardTop = clamp(targetRect.top - ch - arrowGap, pad, viewport.h - ch - pad);
    } else {
      const horizontalBias = stepId === 'send-button' ? (isAr ? 56 : -56) : 0;
      cardLeft = clamp(tcx - cw / 2 + horizontalBias, pad, viewport.w - cw - pad);
      cardTop = clamp(targetRect.bottom + arrowGap, pad, viewport.h - ch - pad);
    }

    const ringOffset = 10;
    let x1 = cardLeft + cw / 2;
    let y1 = cardTop + ch / 2;
    let x2 = tcx;
    let y2 = tcy;

    if (chosenSide === 'left') {
      x1 = cardLeft + cw;
      y1 = clamp(tcy, cardTop + 22, cardTop + ch - 22);
      x2 = targetRect.left - ringOffset;
      y2 = tcy;
    } else if (chosenSide === 'right') {
      x1 = cardLeft;
      y1 = clamp(tcy, cardTop + 22, cardTop + ch - 22);
      x2 = targetRect.right + ringOffset;
      y2 = tcy;
    } else if (chosenSide === 'top') {
      x1 = clamp(tcx, cardLeft + 30, cardLeft + cw - 30);
      y1 = cardTop + ch;
      x2 = clamp(tcx, targetRect.left + 16, targetRect.right - 16);
      y2 = targetRect.top - ringOffset;
    } else {
      x1 = clamp(tcx, cardLeft + 30, cardLeft + cw - 30);
      y1 = cardTop;
      x2 = clamp(tcx, targetRect.left + 16, targetRect.right - 16);
      y2 = targetRect.bottom + ringOffset;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);

    if (dist < 14) {
      return { cardLeft, cardTop, arrow: null };
    }

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const bendSign = chosenSide === 'left' || chosenSide === 'top' ? -1 : 1;
    const bend = clamp(dist * 0.18, 14, 36) * bendSign;
    const cx = mx + nx * bend;
    const cy = my + ny * bend;

    // Exact tangent angle at end of quadratic Bezier
    const angle = Math.atan2(y2 - cy, x2 - cx);
    const tipX = x2 + Math.cos(angle) * 2;
    const tipY = y2 + Math.sin(angle) * 2;
    const headLen = 11.5;
    const spread = 0.46;
    const hx1 = tipX - headLen * Math.cos(angle - spread);
    const hy1 = tipY - headLen * Math.sin(angle - spread);
    const hx2 = tipX - headLen * Math.cos(angle + spread);
    const hy2 = tipY - headLen * Math.sin(angle + spread);
    const notchX = tipX - headLen * 0.72 * Math.cos(angle);
    const notchY = tipY - headLen * 0.72 * Math.sin(angle);

    return {
      cardLeft,
      cardTop,
      arrow: {
        path: `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${notchX.toFixed(1)} ${notchY.toFixed(1)}`,
        x1,
        y1,
        x2: tipX,
        y2: tipY,
        dartPolygon: `${tipX.toFixed(1)},${tipY.toFixed(1)} ${hx1.toFixed(1)},${hy1.toFixed(1)} ${notchX.toFixed(1)},${notchY.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)}`,
        nudgeX: Math.cos(angle) * 2.5,
        nudgeY: Math.sin(angle) * 2.5,
      },
    };
  }, [targetRect, cardSize, viewport, stepId, isAr]);

  if (!isOpen) return null;

  // Bold, concise single-line headlines only (zero filler descriptions)
  const title = (() => {
    switch (stepId) {
      case 'new-chat':
        if (!isSidebarOpen) {
          return isAr ? 'افتح القائمة وابدأ دردشة جديدة' : 'Open menu to start a new chat';
        }
        return isAr ? 'دوس هنا لبدء دردشة جديدة' : 'Click here to start a new chat';

      case 'chat-input':
        return isAr ? 'اكتب سؤالك هنا أو سجّله بالمايك' : 'Type your question or use the mic';

      case 'send-button':
        return isAr ? 'دوس إرسال دلوقتي' : 'Click Send now';

      case 'waiting':
        return isAr ? 'صحتي بيجهّز الإجابة...' : 'Sehati is preparing your answer...';

      case 'response':
        return hasSourcesInLatest
          ? isAr
            ? 'راجع الإجابة والمصادر من هنا'
            : 'Review your answer & sources here'
          : isAr
          ? 'وصلت الإجابة!'
          : 'Your answer is ready!';

      case 'continue':
        return hasFollowUpsInLatest
          ? isAr
            ? 'كمّل بسؤال مقترح أو اسأل جديد'
            : 'Pick a follow-up or ask a new question'
          : isAr
          ? 'كده بقيت جاهز تسأل أي وقت!'
          : 'You are all set to ask anytime!';
    }
  })();

  const isLastStep = stepIndex >= TOUR_STEPS.length - 1;
  const examplePrompt = isAr
    ? 'ما هو مرض السكري وما أنواعه الرئيسية؟'
    : 'What is diabetes and what are its main types?';

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden">
      <style>{TOUR_CSS}</style>

      {/* Subtle Realistic Spotlight Cutout + Sleek Curved SVG Arrow */}
      <svg
        aria-hidden="true"
        className="fixed inset-0 w-full h-full pointer-events-none"
        width={viewport.w}
        height={viewport.h}
      >
        <defs>
          <mask id="sehati-tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={Math.max(0, targetRect.left - 5)}
                y={Math.max(0, targetRect.top - 5)}
                width={targetRect.width + 10}
                height={targetRect.height + 10}
                rx={Math.min(26, (targetRect.height + 10) / 2)}
                fill="black"
              />
            )}
          </mask>

          <linearGradient id="sehati-arrow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>

          <filter id="sehati-arrow-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.18" />
          </filter>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.15)"
          mask="url(#sehati-tour-spotlight-mask)"
        />

        {layout.arrow && (
          <g filter="url(#sehati-arrow-shadow)">
            <path
              d={layout.arrow.path}
              fill="none"
              stroke="url(#sehati-arrow-grad)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            <path
              d={layout.arrow.path}
              fill="none"
              stroke="rgba(255, 255, 255, 0.65)"
              strokeWidth="1.4"
              strokeLinecap="round"
              className="sehati-arrow-flow"
            />

            <circle
              cx={layout.arrow.x1}
              cy={layout.arrow.y1}
              r="3.5"
              fill="#ffffff"
              stroke="#059669"
              strokeWidth="2"
            />

            {/* Sleek filled vector dart arrowhead aligned to exact curve tangent */}
            <g
              className="sehati-tip-nudge"
              style={
                {
                  '--tx': `${layout.arrow.nudgeX.toFixed(1)}px`,
                  '--ty': `${layout.arrow.nudgeY.toFixed(1)}px`,
                } as React.CSSProperties
              }
            >
              <polygon points={layout.arrow.dartPolygon} fill="#047857" />
            </g>
          </g>
        )}
      </svg>

      {/* Realistic Breathing Halo Ring framing the Active Element */}
      {targetRect && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none transition-[top,left,width,height] duration-200 ease-out sehati-target-halo"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: Math.min(26, (targetRect.height + 8) / 2),
          }}
        />
      )}

      {/* Compact, Realistic Floating Coachmark Card (Bold Title Only — Zero Clutter) */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={isAr ? 'جولة تفاعلية في صحتي' : 'Interactive Sehati walkthrough'}
        dir={isAr ? 'rtl' : 'ltr'}
        style={{
          left: layout.cardLeft,
          top: layout.cardTop,
        }}
        className="fixed pointer-events-auto w-[min(272px,calc(100vw-2rem))] bg-white/98 dark:bg-zinc-900/98 backdrop-blur-md border border-slate-200/90 dark:border-zinc-700/80 rounded-2xl shadow-[0_14px_34px_-8px_rgba(15,23,42,0.2),0_2px_6px_rgba(15,23,42,0.06)] px-3.5 py-3 text-start transition-[top,left] duration-200 ease-out"
      >
        {/* Realistic Connected Stepper + Close */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center flex-1 min-w-0" aria-label={`${stepIndex + 1} / ${TOUR_STEPS.length}`}>
            {TOUR_STEPS.map((id, idx) => {
              const isCompleted = idx < stepIndex;
              const isActive = idx === stepIndex;
              return (
                <React.Fragment key={id}>
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isActive
                        ? 'bg-white dark:bg-zinc-900 border-2 border-emerald-600 dark:border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]'
                        : 'bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    ) : null}
                  </span>
                  {idx < TOUR_STEPS.length - 1 && (
                    <span
                      className={`h-[2px] flex-1 mx-0.5 rounded-full transition-colors duration-200 ${
                        idx < stepIndex
                          ? 'bg-emerald-500 dark:bg-emerald-400'
                          : 'bg-slate-200 dark:bg-zinc-800'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onSkip}
            aria-label={isAr ? 'إنهاء الجولة' : 'Close tour'}
            className="p-1 -m-0.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Bold Headline Only */}
        <p className="text-[0.875rem] font-bold text-slate-900 dark:text-white leading-snug">
          {title}
        </p>

        {/* Optional 1-click Example Chip on Step 2 */}
        {stepId === 'chat-input' && onPrefillExample && (
          <button
            type="button"
            onClick={() => onPrefillExample(examplePrompt)}
            className="mt-2.5 w-full px-2.5 py-1.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 text-[0.72rem] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {isAr ? 'جرّب: ما هو مرض السكري؟' : 'Try: What is diabetes?'}
            </span>
          </button>
        )}

        {/* Compact Footer Controls */}
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-[0.72rem] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isAr ? 'تخطي' : 'Skip'}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => onStepChange(stepIndex - 1)}
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[0.72rem] font-semibold border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isAr ? (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronLeft className="w-3 h-3 shrink-0" />
                )}
                <span>{isAr ? 'السابق' : 'Back'}</span>
              </button>
            )}

            {isLastStep ? (
              <button
                type="button"
                onClick={onComplete}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.72rem] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-3 h-3 shrink-0" />
                <span>{isAr ? 'تمام' : 'Done'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStepChange(stepIndex + 1)}
                className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-[0.72rem] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>{isAr ? 'التالي' : 'Next'}</span>
                {isAr ? (
                  <ChevronLeft className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
