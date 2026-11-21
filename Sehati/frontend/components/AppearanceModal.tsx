/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Type, Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { FONT_SCALE_STEPS, FontFamily, FontScale, Language } from '../types';

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => void;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  simpleMode?: boolean;
  setSimpleMode?: (simple: boolean) => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({
  isOpen,
  onClose,
  lang,
  fontFamily,
  setFontFamily,
  fontScale,
  setFontScale,
}) => {
  if (!isOpen) return null;
  const isAr = lang === 'ar';

  const fonts: {
    id: FontFamily;
    labelAr: string;
    labelEn: string;
  }[] = [
    { id: 'cairo', labelAr: 'كايرو', labelEn: 'Cairo' },
    { id: 'alexandria', labelAr: 'الإسكندرية', labelEn: 'Alexandria' },
    { id: 'amiri', labelAr: 'أميري', labelEn: 'Amiri' },
    { id: 'system', labelAr: 'النظام', labelEn: 'System' },
  ];

  const currentIdx = FONT_SCALE_STEPS.indexOf(fontScale);
  const canDecrease = currentIdx > 0;
  const canIncrease = currentIdx < FONT_SCALE_STEPS.length - 1;

  const handleDecrease = () => {
    if (canDecrease) {
      setFontScale(FONT_SCALE_STEPS[currentIdx - 1]);
    }
  };

  const handleIncrease = () => {
    if (canIncrease) {
      setFontScale(FONT_SCALE_STEPS[currentIdx + 1]);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[20rem] max-h-[85dvh] overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-3.5 sm:p-4 space-y-3.5 animate-in zoom-in-95 duration-150 text-start"
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Type className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {isAr ? 'الخط' : 'Font'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Font Family - Compact 2x2 Grid with live font preview */}
        <div className="grid grid-cols-2 gap-1.5">
          {fonts.map((f) => {
            const isSelected = fontFamily === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFontFamily(f.id)}
                className={`px-2.5 py-2 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-1.5 min-w-0 font-${f.id} ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold'
                    : 'border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/70 text-slate-700 dark:text-slate-200 hover:border-emerald-400'
                }`}
              >
                <span className="truncate">{isAr ? f.labelAr : f.labelEn}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Font Size - Single Compact Inline Row */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            {isAr ? 'الحجم' : 'Size'}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDecrease}
              disabled={!canDecrease}
              aria-label={isAr ? 'تصغير حجم الخط' : 'Decrease font size'}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setFontScale(100)}
              disabled={fontScale === 100}
              title={isAr ? 'إعادة ضبط (100%)' : 'Reset to 100%'}
              className="min-w-[3.25rem] h-8 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300 hover:border-emerald-500 disabled:opacity-80 disabled:cursor-default flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <span>{fontScale}%</span>
              {fontScale !== 100 && <RotateCcw className="w-2.5 h-2.5 opacity-70" />}
            </button>

            <button
              type="button"
              onClick={handleIncrease}
              disabled={!canIncrease}
              aria-label={isAr ? 'تكبير حجم الخط' : 'Increase font size'}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
