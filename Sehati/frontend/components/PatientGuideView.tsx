/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Pill,
  Flame,
  Stethoscope,
  BarChart3,
  Activity,
  Search,
  Crosshair,
  Gauge,
  Clock,
  HeartPulse,
  Brain,
  Thermometer,
  Frown,
  Wind,
  Zap,
  Utensils,
  AlarmClock,
  ShieldCheck,
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Language } from '../types';
import { VITAL_SIGNS_REFERENCE } from '../data/constants';

interface PatientGuideViewProps {
  lang: Language;
}

/* ------------------------------------------------------------------ */
/*  3D / motion layer (CSS only, scoped under .pgv)                    */
/* ------------------------------------------------------------------ */
const PGV_CSS = `
.pgv .tilt{position:relative;contain:layout style;transition:transform .16s ease-out,box-shadow .18s ease,border-color .15s ease}
.pgv .tilt:hover{transform-style:preserve-3d;will-change:transform;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-2px)}
.pgv .tilt::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .18s;background:radial-gradient(circle at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.6),transparent 55%)}
.pgv .tilt:hover::after{opacity:1}
.pgv .tilt:hover .p3{transform-style:preserve-3d}
.pgv .tilt:hover .z1{transform:translateZ(12px)}
.pgv .tilt:hover .z2{transform:translateZ(26px)}
.pgv .fb{transform-box:fill-box;transform-origin:center}

.pgv .ecg{stroke-dasharray:100;animation:pgv-ecg 3.2s ease-in-out infinite}
.pgv .floaty{animation:pgv-float 4s ease-in-out infinite}
.pgv .floaty2{animation:pgv-float 5s ease-in-out -2s infinite}
.pgv .shpulse{animation:pgv-pulse 2.6s ease-in-out infinite}
.pgv .rays{animation:pgv-flash 1.4s ease-in-out infinite}
.pgv .pop{animation:pgv-pop .35s cubic-bezier(.3,1.6,.5,1) both}
.pgv .hov:hover .wob{animation:pgv-wobble .7s ease-in-out}
.pgv .hov:hover .qmark{animation:pgv-wobble .7s ease-in-out}
.pgv .rowbadge{transition:transform .22s cubic-bezier(.3,1.5,.5,1)}
.pgv .row:hover .rowbadge{transform:translateZ(26px) scale(1.1) rotate(-6deg)}

@keyframes pgv-ecg{0%{stroke-dashoffset:100;opacity:1}55%{stroke-dashoffset:0;opacity:1}85%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes pgv-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes pgv-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes pgv-flash{0%,100%{opacity:.25}50%{opacity:1}}
@keyframes pgv-pop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes pgv-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-9deg)}60%{transform:rotate(7deg)}}

@media (prefers-reduced-motion:reduce){
  .pgv .tilt{transform:none!important;transition:none}
  .pgv *{animation:none!important}
}
`;

let pgvScrollCooldownUntil = 0;
let pgvRectCache = new WeakMap<HTMLElement, DOMRect>();
const pgvRafMap = new WeakMap<HTMLElement, number>();
let pgvScrollListenerBound = false;

function ensurePgvScrollGuard() {
  if (pgvScrollListenerBound || typeof window === 'undefined') return;
  pgvScrollListenerBound = true;
  const markScrolling = () => {
    pgvScrollCooldownUntil = performance.now() + 140;
    pgvRectCache = new WeakMap<HTMLElement, DOMRect>();
  };
  window.addEventListener('scroll', markScrolling, { capture: true, passive: true });
  window.addEventListener('wheel', markScrolling, { passive: true });
}

/** Scroll-safe pointer-driven 3D tilt with cached bounds and rAF throttling */
function useTilt(max = 5) {
  return useMemo(() => {
    ensurePgvScrollGuard();
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'touch' || performance.now() < pgvScrollCooldownUntil) return;
        const el = e.currentTarget;
        pgvRectCache.set(el, el.getBoundingClientRect());
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'touch' || e.buttons !== 0 || performance.now() < pgvScrollCooldownUntil) return;
        const el = e.currentTarget;
        let r = pgvRectCache.get(el);
        if (!r) {
          r = el.getBoundingClientRect();
          pgvRectCache.set(el, r);
        }
        if (r.width === 0 || r.height === 0) return;
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const prevRaf = pgvRafMap.get(el);
        if (prevRaf !== undefined) window.cancelAnimationFrame(prevRaf);
        pgvRafMap.set(
          el,
          window.requestAnimationFrame(() => {
            el.style.setProperty('--ry', `${(px - 0.5) * max * 2}deg`);
            el.style.setProperty('--rx', `${-(py - 0.5) * max * 2}deg`);
            el.style.setProperty('--gx', `${px * 100}%`);
            el.style.setProperty('--gy', `${py * 100}%`);
            pgvRafMap.delete(el);
          })
        );
      },
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        const prevRaf = pgvRafMap.get(el);
        if (prevRaf !== undefined) {
          window.cancelAnimationFrame(prevRaf);
          pgvRafMap.delete(el);
        }
        pgvRectCache.delete(el);
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      },
    };
  }, [max]);
}

/* ------------------------------------------------------------------ */
/*  Hero illustrations                                                 */
/* ------------------------------------------------------------------ */

/** Glossy green speech bubble with a question mark */
const ChatBubbleIllustration: React.FC = () => (
  <svg viewBox="0 0 100 100" className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 drop-shadow-[0_12px_12px_rgba(6,78,59,0.3)]" aria-hidden="true">
    <defs>
      <linearGradient id="pgBub" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6EE7B7" />
        <stop offset="45%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#065F46" />
      </linearGradient>
      <linearGradient id="pgBubGloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
    </defs>
    <g className="wob fb">
      <path d="M50 8C27 8 10 23 10 43C10 54 15 63 23 69C22 76 19 82 14 87C24 86 32 82 37 78C41 79 45 80 50 80C73 80 90 65 90 43C90 23 73 8 50 8Z" fill="url(#pgBub)" />
      <path d="M50 8C27 8 10 23 10 43C10 46 10.5 49 11.5 52C30 40 70 40 88.5 52C89.5 49 90 46 90 43C90 23 73 8 50 8Z" fill="url(#pgBubGloss)" opacity="0.6" />
      <g className="qmark fb">
        <text x="50" y="62" textAnchor="middle" fontSize="46" fontWeight="900" fill="#064E3B" opacity="0.35" fontFamily="inherit">?</text>
        <text x="50" y="59" textAnchor="middle" fontSize="46" fontWeight="900" fill="#FFFFFF" fontFamily="inherit">?</text>
      </g>
    </g>
    <g className="rays" stroke="#EF4444" strokeWidth="3" strokeLinecap="round">
      <line x1="84" y1="8" x2="90" y2="14" />
      <line x1="92" y1="22" x2="98" y2="24" />
    </g>
  </svg>
);

/** Clipboard with a red cross and a green verified shield */
const ClipboardShieldIllustration: React.FC = () => (
  <svg viewBox="0 0 130 112" className="w-32 sm:w-40 h-auto shrink-0 drop-shadow-[0_12px_12px_rgba(6,78,59,0.25)]" aria-hidden="true">
    <defs>
      <linearGradient id="pgBoard" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#34D399" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="pgClip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#064E3B" />
      </linearGradient>
      <linearGradient id="pgCross" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F87171" />
        <stop offset="100%" stopColor="#B91C1C" />
      </linearGradient>
      <linearGradient id="pgShield" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6EE7B7" />
        <stop offset="50%" stopColor="#059669" />
        <stop offset="100%" stopColor="#064E3B" />
      </linearGradient>
    </defs>
    <ellipse cx="62" cy="106" rx="50" ry="4" fill="#064E3B" opacity="0.18" />
    <g transform="rotate(-8 50 55)">
      <rect x="20" y="14" width="62" height="84" rx="9" fill="url(#pgBoard)" />
      <rect x="20" y="14" width="62" height="10" rx="5" fill="#FFFFFF" opacity="0.25" />
      <rect x="27" y="25" width="48" height="66" rx="4" fill="#FFFFFF" />
      <rect x="38" y="8" width="26" height="15" rx="5" fill="url(#pgClip)" />
      <circle cx="51" cy="14" r="2.6" fill="#FFFFFF" />
      <rect x="47" y="35" width="8" height="21" rx="2" fill="url(#pgCross)" />
      <rect x="40.5" y="41.5" width="21" height="8" rx="2" fill="url(#pgCross)" />
      <rect x="32" y="63" width="38" height="4" rx="2" fill="#A7F3D0" />
      <rect x="32" y="71" width="30" height="4" rx="2" fill="#A7F3D0" />
      <rect x="32" y="79" width="34" height="4" rx="2" fill="#A7F3D0" />
    </g>
    <g className="shpulse fb" transform="translate(68 34)">
      <path d="M30 2L56 12V32C56 50 45 62 30 69C15 62 4 50 4 32V12Z" fill="url(#pgShield)" stroke="#A7F3D0" strokeWidth="1.5" />
      <path d="M30 2L56 12V24C44 30 16 30 4 24V12Z" fill="#FFFFFF" opacity="0.28" />
      <path d="M17 35L27 45L45 24" fill="none" stroke="#064E3B" strokeOpacity="0.35" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1.5)" />
      <path d="M17 35L27 45L45 24" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
type Tone = 'red' | 'green';

const TONE_BADGE: Record<Tone, string> = {
  red: 'from-rose-400 to-red-600 shadow-[0_8px_14px_rgba(220,38,38,0.32),inset_0_2px_3px_rgba(255,255,255,0.55),inset_0_-3px_4px_rgba(127,29,29,0.35)]',
  green: 'from-emerald-400 to-emerald-700 shadow-[0_8px_14px_rgba(5,150,105,0.32),inset_0_2px_3px_rgba(255,255,255,0.55),inset_0_-3px_4px_rgba(6,78,59,0.35)]',
};

/** Glossy 3D icon badge */
const Badge: React.FC<{ tone: Tone; icon: LucideIcon; size?: 'sm' | 'md'; className?: string }> = ({
  tone,
  icon: Icon,
  size = 'md',
  className = '',
}) => (
  <span
    className={`relative grid place-items-center rounded-full text-white bg-gradient-to-b shrink-0 ${
      size === 'md' ? 'w-11 h-11' : 'w-9 h-9'
    } ${TONE_BADGE[tone]} ${className}`}
  >
    <span className="absolute top-[7%] start-[18%] w-[55%] h-[34%] rounded-full bg-white/40 blur-[1px]" aria-hidden="true" />
    <Icon className={`relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] ${size === 'md' ? 'w-5 h-5' : 'w-4 h-4'}`} strokeWidth={2.4} />
  </span>
);

const Section: React.FC<{
  title: string;
  icon: LucideIcon;
  tone: Tone;
  extra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, tone, extra, children }) => (
  <section className="rounded-[28px] bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-[0_0_24px_rgba(15,23,42,0.075),0_8px_24px_rgba(15,23,42,0.06)] dark:shadow-[0_0_24px_rgba(0,0,0,0.35),0_8px_24px_rgba(0,0,0,0.3)] p-4 sm:p-5 space-y-3.5">
    <div className="flex items-center gap-2.5">
      <Badge tone={tone} icon={icon} size="sm" />
      <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">{title}</h3>
      {extra}
    </div>
    {children}
  </section>
);

interface FaqItem {
  id: string;
  icon: LucideIcon;
  tone: Tone;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export const PatientGuideView: React.FC<PatientGuideViewProps> = React.memo(({ lang }) => {
  const isAr = lang === 'ar';
  const tilt = useTilt(4);
  const tiltSoft = useTilt(10);

  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedVital, setSelectedVital] = useState<number | null>(null);

  const toggleOpen = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  const Chevron = isAr ? ChevronLeft : ChevronRight;
  const chevronOpen = isAr ? '-rotate-90' : 'rotate-90';

  /** PQRST: how to describe pain to your doctor */
  const pqrstItems: FaqItem[] = [
    {
      id: 'P',
      icon: Activity,
      tone: 'red',
      titleAr: 'إيه اللي بيزود أو يقلل الوجع؟',
      titleEn: 'What makes it better or worse?',
      descAr: 'حركة، أكل، راحة، ولا نفس عميق؟',
      descEn: 'Movement, food, rest, or deep breathing?',
    },
    {
      id: 'Q',
      icon: Search,
      tone: 'green',
      titleAr: 'نوع الوجع إيه؟',
      titleEn: 'What does the pain feel like?',
      descAr: 'حرقان، نغز، ضغط كتمة، ولا مغص؟',
      descEn: 'Burning, stabbing, pressure, or cramping?',
    },
    {
      id: 'R',
      icon: Crosshair,
      tone: 'green',
      titleAr: 'مكانه فين ومسمّع فين؟',
      titleEn: 'Where is it radiating?',
      descAr: 'مكانه بالظبط، وهل مسمّع في كتفك، ضهرك، أو فكك؟',
      descEn: 'Exact spot, does it radiate to shoulder, jaw, or back?',
    },
    {
      id: 'S',
      icon: Gauge,
      tone: 'red',
      titleAr: 'شدته كام من 10؟',
      titleEn: 'Severity from 1 to 10?',
      descAr: 'تقييمك للألم وهل مانعك تنام؟',
      descEn: 'Pain score and does it affect sleep?',
    },
    {
      id: 'T',
      icon: Clock,
      tone: 'red',
      titleAr: 'بدأ إمتى ومستمر بقاله قد إيه؟',
      titleEn: 'When did it start?',
      descAr: 'مفاجئ ولا بالتدريج، وبقاله دقايق ولا أيام؟',
      descEn: 'Sudden or gradual, minutes or days?',
    },
  ];

  const emergencyAr = 'لو الحالة شديدة أو مفاجئة، اتصل بالطوارئ فوراً.';
  const emergencyEn = 'If it is severe or sudden, call emergency services right away.';

  /** Possible symptoms */
  const symptomItems: FaqItem[] = [
    {
      id: 's1',
      icon: HeartPulse,
      tone: 'red',
      titleAr: 'ألم في الكلى أو البطن',
      titleEn: 'Kidney or abdominal pain',
      descAr: `حدد مكان الألم بالظبط وهل بيزيد مع الحركة أو الأكل. ${emergencyAr}`,
      descEn: `Pinpoint the spot and note if movement or food changes it. ${emergencyEn}`,
    },
    {
      id: 's2',
      icon: Brain,
      tone: 'green',
      titleAr: 'ألم في الرأس',
      titleEn: 'Headache',
      descAr: `لاحظ هل الألم مفاجئ وشديد ولا تدريجي، وهل معاه قيء أو تشوش في الرؤية. ${emergencyAr}`,
      descEn: `Note if it is sudden and severe or gradual, and if vomiting or blurred vision come with it. ${emergencyEn}`,
    },
    {
      id: 's3',
      icon: Thermometer,
      tone: 'red',
      titleAr: 'حرارة أو ارتفاع في درجة الحرارة',
      titleEn: 'Fever or high temperature',
      descAr: `قِس درجة حرارتك وسجّل الرقم والوقت. ${emergencyAr}`,
      descEn: `Measure your temperature and write down the number and time. ${emergencyEn}`,
    },
    {
      id: 's4',
      icon: Frown,
      tone: 'green',
      titleAr: 'غثيان أو قيء',
      titleEn: 'Nausea or vomiting',
      descAr: `لاحظ عدد مرات القيء وهل تقدر تشرب سوائل. ${emergencyAr}`,
      descEn: `Count how often you vomit and whether you can keep fluids down. ${emergencyEn}`,
    },
    {
      id: 's5',
      icon: Zap,
      tone: 'red',
      titleAr: 'المغص أو آلام في المعدة',
      titleEn: 'Cramps or stomach pain',
      descAr: `لاحظ علاقة الألم بالأكل ووجود حرقان أو مغص. ${emergencyAr}`,
      descEn: `Note how it relates to meals and whether it burns or cramps. ${emergencyEn}`,
    },
    {
      id: 's6',
      icon: Wind,
      tone: 'green',
      titleAr: 'سعال أو زكام',
      titleEn: 'Cough or cold',
      descAr: `لاحظ هل الكحة جافة ولا بلغم، وهل معاها ضيق نفس. ${emergencyAr}`,
      descEn: `Note if the cough is dry or productive and if you feel short of breath. ${emergencyEn}`,
    },
  ];

  /** Questions to ask the pharmacist (same expandable rows as above) */
  const pharmacistItems: FaqItem[] = [
    {
      id: 'q1',
      icon: Utensils,
      tone: 'red',
      titleAr: 'قبل الأكل ولا بعده؟',
      titleEn: 'Before or after meals?',
      descAr: 'بعض الأدوية بتتمتص أحسن مع الأكل وبعضها على معدة فاضية. اسأل الصيدلي عن الأنسب لدوائك.',
      descEn: 'Some medicines work best with food and others on an empty stomach. Ask which suits yours.',
    },
    {
      id: 'q2',
      icon: AlarmClock,
      tone: 'green',
      titleAr: 'لو نسيت جرعة أعمل إيه؟',
      titleEn: 'What to do if I miss a dose?',
      descAr: 'الإجابة بتختلف من دواء لدواء، اسأل هل تاخدها لما تفتكر ولا تستنى الجرعة الجاية.',
      descEn: 'It varies by medicine. Ask whether to take it when you remember or wait for the next dose.',
    },
    {
      id: 'q3',
      icon: ShieldCheck,
      tone: 'green',
      titleAr: 'هل بيتعارض مع علاجاتي التانية؟',
      titleEn: 'Does it interact with other meds?',
      descAr: 'قول للصيدلي على كل أدويتك والمكملات والأعشاب اللي بتاخدها عشان يتأكد إنها مش بتتعارض.',
      descEn: 'Tell the pharmacist about all your medicines, supplements, and herbs so they can check for interactions.',
    },
    {
      id: 'q4',
      icon: AlertCircle,
      tone: 'red',
      titleAr: 'إيه الآثار الجانبية المتوقعة؟',
      titleEn: 'What side effects to expect?',
      descAr: 'اعرف الأعراض الطبيعية، والأعراض اللي لازم ترجع للدكتور أو الطوارئ بسببها.',
      descEn: 'Learn which effects are normal and which ones mean you should contact your doctor or emergency services.',
    },
    {
      id: 'q5',
      icon: CalendarDays,
      tone: 'red',
      titleAr: 'المفروض أكمله كام يوم بالظبط؟',
      titleEn: 'How many days should I take it?',
      descAr: 'بعض الأدوية لازم تكمل مدتها كاملة. اسأل الصيدلي عن المدة المناسبة لدوائك.',
      descEn: 'Some medicines must be finished in full. Ask the pharmacist how long yours should be taken.',
    },
  ];

  /** Expandable FAQ row (pill, 3D tilt, accordion) */
  const renderFaqRow = (item: FaqItem) => {
    const open = openId === item.id;
    return (
      <div
        key={item.id}
        {...tilt}
        className={`tilt row rounded-[28px] border bg-gradient-to-br transition-colors ${
          open
            ? 'from-white to-emerald-50/70 dark:from-slate-900 dark:to-emerald-950/30 border-emerald-300/80 shadow-[0_14px_26px_rgba(5,150,105,0.14)]'
            : 'from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/60 border-slate-200/80 dark:border-slate-800 shadow-[0_3px_10px_rgba(15,23,42,0.05)] hover:border-emerald-300 hover:shadow-[0_14px_24px_rgba(15,23,42,0.1)]'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleOpen(item.id)}
          aria-expanded={open}
          aria-controls={`faq-${item.id}`}
          className="p3 w-full flex items-center gap-3 p-2 pe-3.5 text-start cursor-pointer rounded-[28px] focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <span className="rowbadge z2 shrink-0">
            <Badge tone={item.tone} icon={item.icon} />
          </span>
          <span className="z1 flex-1 min-w-0 font-bold text-sm sm:text-[0.9375rem] text-slate-900 dark:text-white leading-snug">
            {isAr ? item.titleAr : item.titleEn}
          </span>
          <span
            className={`z1 w-7 h-7 rounded-full grid place-items-center shrink-0 transition-transform duration-200 shadow-[0_2px_5px_rgba(15,23,42,0.12)] ${
              open ? `${chevronOpen} bg-emerald-100 text-emerald-700` : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            <Chevron className="w-4 h-4" />
          </span>
        </button>

        <div
          id={`faq-${item.id}`}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <p className="px-4 pb-3.5 ps-[3.75rem] text-xs sm:text-[0.8125rem] leading-relaxed text-slate-600 dark:text-slate-300">
              {isAr ? item.descAr : item.descEn}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const vitalCols: { key: 'normal' | 'warning' | 'emergency'; labelAr: string; labelEn: string; head: string; cell: string }[] = [
    {
      key: 'normal',
      labelAr: 'الطبيعي',
      labelEn: 'Normal',
      head: 'text-emerald-700 dark:text-emerald-300',
      cell: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-400',
    },
    {
      key: 'warning',
      labelAr: 'تحذير',
      labelEn: 'Warning',
      head: 'text-rose-500 dark:text-rose-300',
      cell: 'bg-rose-50 dark:bg-rose-950/30 text-rose-500 dark:text-rose-300 ring-rose-300',
    },
    {
      key: 'emergency',
      labelAr: 'خطورة',
      labelEn: 'Emergency',
      head: 'text-red-700 dark:text-red-300',
      cell: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-extrabold ring-red-400',
    },
  ];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="pgv w-full min-h-full flex flex-col bg-white dark:bg-slate-950 text-start"
    >
      <style>{PGV_CSS}</style>

      <div className="my-auto w-full max-w-5xl mx-auto px-3 sm:px-6 pt-24 sm:pt-28 pb-10 space-y-5">
        {/* Hero: bubble + title | ECG | clipboard & shield */}
        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 self-start sm:self-center z-10">
            <div {...tiltSoft} className="tilt hov rounded-3xl">
              <div className="z2 floaty">
                <ChatBubbleIllustration />
              </div>
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                {isAr ? 'أسئلة شائعة' : 'Common Questions'}
              </h1>
              <p className="text-xs sm:text-base font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'إجابات سريعة على استفساراتك الصحية' : 'Quick answers to your health questions'}
              </p>
            </div>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center px-4" aria-hidden="true">
            <svg viewBox="0 0 220 48" className="w-full max-w-[240px] h-12">
              <defs>
                <linearGradient id="pgEcgFade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0" />
                  <stop offset="25%" stopColor="#EF4444" stopOpacity="0.9" />
                  <stop offset="75%" stopColor="#DC2626" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="ecg"
                pathLength={100}
                d="M4 26H78L88 26L97 8L108 42L118 16L126 26H216"
                fill="none"
                stroke="url(#pgEcgFade)"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="hidden sm:flex items-center gap-1 relative">
            <span aria-hidden="true" className="floaty2 absolute -top-1 end-0 text-red-300 text-3xl font-black leading-none select-none">+</span>
            <div {...tiltSoft} className="tilt hov rounded-3xl">
              <div className="z2 floaty2">
                <ClipboardShieldIllustration />
              </div>
            </div>
          </div>
        </div>

        {/* 1. Most common questions (PQRST) */}
        <Section
          title={isAr ? 'أكثر الأسئلة شيوعاً' : 'Most Common Questions'}
          icon={Flame}
          tone="red"
          extra={
            <span className="ms-auto text-[0.6875rem] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300 border border-red-100 dark:border-red-900/50">
              PQRST
            </span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">{pqrstItems.map(renderFaqRow)}</div>
        </Section>

        {/* 2. Possible symptoms */}
        <Section title={isAr ? 'أعراضك المحتملة' : 'Your Possible Symptoms'} icon={Stethoscope} tone="green">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">{symptomItems.map(renderFaqRow)}</div>
        </Section>

        {/* 3. Vitals normal ranges */}
        <Section title={isAr ? 'المعدلات الطبيعية للمؤشرات الحيوية' : 'Normal Vital Ranges'} icon={BarChart3} tone="green">
          <div className="overflow-x-auto -mx-1.5 px-1.5 pb-1">
            <table className="w-full min-w-[560px] text-start border-separate [border-spacing:6px]">
              <thead>
                <tr>
                  <th className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-2 px-3 text-xs font-bold text-slate-500 text-start">
                    {isAr ? 'المؤشر' : 'Vital'}
                  </th>
                  {vitalCols.map((c) => (
                    <th
                      key={c.key}
                      className={`rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-2 px-3 text-xs font-bold text-start ${c.head}`}
                    >
                      {isAr ? c.labelAr : c.labelEn}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VITAL_SIGNS_REFERENCE.map((v, i) => {
                  const selected = selectedVital === i;
                  const values = {
                    normal: isAr ? v.normal : v.normalEn,
                    warning: isAr ? v.warning : v.warningEn,
                    emergency: isAr ? v.emergency : v.emergencyEn,
                  };
                  return (
                    <tr
                      key={i}
                      onClick={() => setSelectedVital(selected ? null : i)}
                      className="group cursor-pointer"
                    >
                      <td
                        className={`rounded-xl py-2.5 px-3 text-sm font-extrabold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_14px_rgba(15,23,42,0.1)] ${
                          selected ? 'ring-2 ring-slate-400 -translate-y-0.5' : ''
                        }`}
                      >
                        {isAr ? v.parameterAr : v.parameterEn}
                      </td>
                      {vitalCols.map((c) => (
                        <td
                          key={c.key}
                          className={`rounded-xl py-2.5 px-3 text-sm font-bold tabular-nums transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_14px_rgba(15,23,42,0.1)] ${c.cell} ${
                            selected ? 'ring-2 -translate-y-0.5 shadow-[0_8px_14px_rgba(15,23,42,0.12)]' : ''
                          }`}
                        >
                          {values[c.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 4. Questions for the pharmacist */}
        <Section title={isAr ? 'اسأل الصيدلي الحاجات دي وأنت بتستلم العلاج' : 'Ask Your Pharmacist'} icon={Pill} tone="red">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">{pharmacistItems.map(renderFaqRow)}</div>
        </Section>
      </div>
    </div>
  );
});