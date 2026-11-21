/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  PhoneCall,
  Search,
  Copy,
  Check,
  Flame,
  Shield,
  Globe,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { Language } from '../types';
import { EMERGENCY_CONTACTS, TRIAGE_LEVELS } from '../data/constants';

interface EmergencyDirectoryViewProps {
  lang: Language;
}

/** Same card order as the reference design (right-to-left: row 1 then row 2) */
const COUNTRY_ORDER = ['EG', 'SA', 'AE', 'JO', 'KW', 'US', 'UK', 'EU'];

/* ------------------------------------------------------------------ */
/*  3D / motion layer (CSS only, scoped under .edv)                    */
/* ------------------------------------------------------------------ */
const EDV_CSS = `
.edv .tilt{position:relative;contain:layout style;transition:transform .16s ease-out,box-shadow .18s ease,border-color .15s ease}
.edv .tilt:hover{transform-style:preserve-3d;will-change:transform;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-4px)}
.edv .tilt::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .18s;background:radial-gradient(circle at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.55),transparent 55%)}
.edv .tilt:hover::after{opacity:1}
.edv .tilt:hover .z1{transform:translateZ(14px)}
.edv .tilt:hover .z2{transform:translateZ(32px)}
.edv .fb{transform-box:fill-box;transform-origin:center}

.edv .siren-a{animation:edv-flash .9s ease-in-out infinite}
.edv .siren-b{animation:edv-flash-b .9s ease-in-out infinite}
.edv .beam{animation:edv-spin 2.4s linear infinite}
.edv .rays{animation:edv-flash 1.2s ease-in-out infinite}
.edv .ecg{stroke-dasharray:100;animation:edv-ecg 3.2s ease-in-out infinite}
.edv .floaty{animation:edv-float 4s ease-in-out infinite}
.edv .ring{animation:edv-ring 2s ease-out infinite}
.edv .pop{animation:edv-pop .35s cubic-bezier(.3,1.6,.5,1) both}
.edv .house,.edv .bulb{transition:transform .25s ease}

.edv .amb{cursor:pointer}
.edv .amb:hover .wheel,.edv .amb.on .wheel{animation:edv-spin .6s linear infinite}
.edv .amb:hover .van,.edv .amb.on .van{animation:edv-bump .35s ease-in-out infinite}
.edv .amb:hover .siren-a,.edv .amb:hover .siren-b,.edv .amb.on .siren-a,.edv .amb.on .siren-b{animation-duration:.3s}

.edv .grp:hover .sway{animation:edv-sway 1.4s ease-in-out infinite}
.edv .grp:hover .house{transform:translateY(-3px) scale(1.06)}
.edv .grp:hover .beam{animation-duration:.8s}
.edv .grp:hover .rays{animation-duration:.45s}

@keyframes edv-flash{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes edv-flash-b{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes edv-spin{to{transform:rotate(360deg)}}
@keyframes edv-ecg{0%{stroke-dashoffset:100;opacity:1}55%{stroke-dashoffset:0;opacity:1}85%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes edv-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes edv-bump{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes edv-ring{0%{transform:scale(.85);opacity:.7}100%{transform:scale(1.25,1.7);opacity:0}}
@keyframes edv-pop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes edv-sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}

@media (prefers-reduced-motion:reduce){
  .edv .tilt{transform:none!important;transition:none}
  .edv *{animation:none!important}
}
`;

let edvScrollCooldownUntil = 0;
let edvRectCache = new WeakMap<HTMLElement, DOMRect>();
const edvRafMap = new WeakMap<HTMLElement, number>();
let edvScrollListenerBound = false;

function ensureEdvScrollGuard() {
  if (edvScrollListenerBound || typeof window === 'undefined') return;
  edvScrollListenerBound = true;
  const markScrolling = () => {
    edvScrollCooldownUntil = performance.now() + 140;
    edvRectCache = new WeakMap<HTMLElement, DOMRect>();
  };
  window.addEventListener('scroll', markScrolling, { capture: true, passive: true });
  window.addEventListener('wheel', markScrolling, { passive: true });
}

/** Scroll-safe pointer-driven 3D tilt with cached bounds and rAF throttling */
function useTilt(max = 7) {
  return useMemo(() => {
    ensureEdvScrollGuard();
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'touch' || performance.now() < edvScrollCooldownUntil) return;
        const el = e.currentTarget;
        edvRectCache.set(el, el.getBoundingClientRect());
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'touch' || e.buttons !== 0 || performance.now() < edvScrollCooldownUntil) return;
        const el = e.currentTarget;
        let r = edvRectCache.get(el);
        if (!r) {
          r = el.getBoundingClientRect();
          edvRectCache.set(el, r);
        }
        if (r.width === 0 || r.height === 0) return;
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const prevRaf = edvRafMap.get(el);
        if (prevRaf !== undefined) window.cancelAnimationFrame(prevRaf);
        edvRafMap.set(
          el,
          window.requestAnimationFrame(() => {
            el.style.setProperty('--ry', `${(px - 0.5) * max * 2}deg`);
            el.style.setProperty('--rx', `${-(py - 0.5) * max * 2}deg`);
            el.style.setProperty('--gx', `${px * 100}%`);
            el.style.setProperty('--gy', `${py * 100}%`);
            edvRafMap.delete(el);
          })
        );
      },
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        const prevRaf = edvRafMap.get(el);
        if (prevRaf !== undefined) {
          window.cancelAnimationFrame(prevRaf);
          edvRafMap.delete(el);
        }
        edvRectCache.delete(el);
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      },
    };
  }, [max]);
}

/* ------------------------------------------------------------------ */
/*  Flags                                                              */
/* ------------------------------------------------------------------ */
const FLAG_ART: Record<string, React.ReactNode> = {
  EG: (
    <>
      <rect width="36" height="8" fill="#CE1126" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#111111" />
      <path d="M18 9.2l1.5 2.8-1.5 2.8-1.5-2.8z" fill="#B8860B" />
    </>
  ),
  SA: (
    <>
      <rect width="36" height="24" fill="#006C35" />
      <rect x="8" y="7" width="20" height="3" rx="1.5" fill="#FFFFFF" />
      <rect x="10" y="14" width="16" height="1.8" rx="0.9" fill="#FFFFFF" />
    </>
  ),
  AE: (
    <>
      <rect x="9" width="27" height="8" fill="#00732F" />
      <rect x="9" y="8" width="27" height="8" fill="#FFFFFF" />
      <rect x="9" y="16" width="27" height="8" fill="#111111" />
      <rect width="9" height="24" fill="#FF0000" />
    </>
  ),
  JO: (
    <>
      <rect width="36" height="8" fill="#111111" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#007A3D" />
      <polygon points="0,0 16,12 0,24" fill="#CE1126" />
      <circle cx="5.5" cy="12" r="1.6" fill="#FFFFFF" />
    </>
  ),
  KW: (
    <>
      <rect width="36" height="8" fill="#007A3D" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#CE1126" />
      <polygon points="0,0 10,7 10,17 0,24" fill="#111111" />
    </>
  ),
  US: (
    <>
      <rect width="36" height="24" fill="#FFFFFF" />
      {[0, 4.8, 9.6, 14.4, 19.2].map((y) => (
        <rect key={y} y={y} width="36" height="2.4" fill="#B22234" />
      ))}
      <rect width="15" height="12.5" fill="#1E3A5F" />
      {[3.5, 7.5, 11.5].map((x) =>
        [3.2, 6.2, 9.2].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#FFFFFF" />)
      )}
    </>
  ),
  UK: (
    <>
      <rect width="36" height="24" fill="#012169" />
      <path d="M0 0L36 24M36 0L0 24" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M0 0L36 24M36 0L0 24" stroke="#C8102E" strokeWidth="2" />
      <path d="M18 0V24M0 12H36" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M18 0V24M0 12H36" stroke="#C8102E" strokeWidth="3.5" />
    </>
  ),
  EU: (
    <>
      <rect width="36" height="24" fill="#003399" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={18 + Math.cos(a) * 7} cy={12 + Math.sin(a) * 7} r="0.95" fill="#FFCC00" />;
      })}
    </>
  ),
};

/** Glossy flag chip with soft depth */
const CountryFlag: React.FC<{ code: string }> = ({ code }) => (
  <span className="relative inline-block shrink-0 rounded-md overflow-hidden ring-1 ring-black/10 shadow-[0_4px_8px_rgba(15,23,42,0.22)]">
    <svg viewBox="0 0 36 24" className="block w-8 h-[22px]" aria-hidden="true">
      {FLAG_ART[code] ?? FLAG_ART.EU}
    </svg>
    <span className="absolute inset-0 bg-gradient-to-br from-white/45 via-transparent to-black/15" />
  </span>
);

/* ------------------------------------------------------------------ */
/*  Illustrations                                                      */
/* ------------------------------------------------------------------ */

/** Beveled red shield with a heartbeat cross */
const MedicalShieldEmblem: React.FC = () => (
  <svg viewBox="0 0 64 68" className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-[0_10px_14px_rgba(220,38,38,0.35)]" aria-hidden="true">
    <defs>
      <linearGradient id="shBody" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FCA5A5" />
        <stop offset="40%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#991B1B" />
      </linearGradient>
      <linearGradient id="shGloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="shCross" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#FEE2E2" />
      </linearGradient>
    </defs>
    <path d="M32 3L57 12.5V31C57 47.2 46.2 58.6 32 64.5C17.8 58.6 7 47.2 7 31V12.5L32 3Z" fill="url(#shBody)" stroke="#FECACA" strokeWidth="1.5" />
    <path d="M32 8L52 15.5V31C52 44 44 53.5 32 59C20 53.5 12 44 12 31V15.5L32 8Z" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" />
    <path d="M32 3L57 12.5V24C45 28 19 28 7 24V12.5L32 3Z" fill="url(#shGloss)" opacity="0.55" />
    <path d="M27.5 19H36.5V28H45.5V37H36.5V46H27.5V37H18.5V28H27.5V19Z" fill="url(#shCross)" stroke="#B91C1C" strokeOpacity="0.25" />
    <path d="M17 33H25L28 26.5L32.5 39L36 30.5L39 33H47" fill="none" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Ambulance: shaded body, flashing red/green siren, wheels spin on hover or tap */
const AmbulanceIllustration: React.FC<{ mirrored?: boolean }> = ({ mirrored = false }) => (
  <svg
    viewBox="0 0 180 110"
    className={`w-44 sm:w-56 h-auto shrink-0 select-none drop-shadow-[0_12px_14px_rgba(15,23,42,0.16)] ${mirrored ? '-scale-x-100' : ''}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="ambBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="70%" stopColor="#F0FDF4" />
        <stop offset="100%" stopColor="#BBF7D0" />
      </linearGradient>
      <linearGradient id="ambStripe" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F87171" />
        <stop offset="100%" stopColor="#B91C1C" />
      </linearGradient>
      <linearGradient id="ambGlass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#A7F3D0" />
        <stop offset="55%" stopColor="#059669" />
        <stop offset="100%" stopColor="#064E3B" />
      </linearGradient>
      <radialGradient id="ambTire" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0F172A" />
      </radialGradient>
      <radialGradient id="ambHub" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#A7F3D0" />
      </radialGradient>
      <radialGradient id="ambGlowR" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#EF4444" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="ambGlowG" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#10B981" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
      </radialGradient>
    </defs>

    <ellipse cx="90" cy="104" rx="72" ry="4.5" fill="#0F172A" opacity="0.18" />

    <g className="van">
      {/* siren glow + bar */}
      <ellipse className="siren-a" cx="94" cy="14" rx="18" ry="11" fill="url(#ambGlowR)" />
      <ellipse className="siren-b" cx="110" cy="14" rx="18" ry="11" fill="url(#ambGlowG)" />
      <rect x="84" y="12" width="36" height="9" rx="4.5" fill="#7F1D1D" />
      <rect className="siren-a" x="86" y="13.5" width="16" height="6" rx="3" fill="#EF4444" />
      <rect className="siren-b" x="102" y="13.5" width="16" height="6" rx="3" fill="#10B981" />

      {/* wheel arches */}
      <circle cx="52" cy="90" r="15" fill="#064E3B" opacity="0.35" />
      <circle cx="132" cy="90" r="15" fill="#064E3B" opacity="0.35" />

      {/* cabin */}
      <path d="M20 34C20 26 26 20 34 20H116C125 20 132 24 137 32L152 54C157 58 160 64 160 71V84C160 88 157 91 153 91H27C23 91 20 88 20 84V34Z" fill="url(#ambBody)" stroke="#BBF7D0" strokeWidth="2" />
      <path d="M26 22H114C120 22 124 23 128 26C110 24 60 24 26 28Z" fill="#FFFFFF" opacity="0.8" />
      <path d="M112 28H126C131 28 135 31 138 35L147 50H112V28Z" fill="url(#ambGlass)" stroke="#065F46" strokeWidth="1.5" />
      <path d="M116 31L126 31L131 41L116 43Z" fill="#FFFFFF" opacity="0.45" />
      <line x1="108" y1="26" x2="108" y2="84" stroke="#86EFAC" strokeWidth="1.2" />

      {/* stripe */}
      <rect x="21" y="61" width="138" height="9" fill="url(#ambStripe)" />
      <rect x="21" y="70" width="138" height="1.5" fill="#7F1D1D" opacity="0.35" />

      {/* cross badge */}
      <rect x="38" y="28" width="34" height="30" rx="6" fill="#FFFFFF" stroke="#FECACA" />
      <rect x="51" y="33" width="8" height="20" rx="2" fill="#DC2626" />
      <rect x="44" y="39" width="22" height="8" rx="2" fill="#DC2626" />
      <rect x="51" y="33" width="3" height="20" rx="1.5" fill="#FFFFFF" opacity="0.35" />

      {/* lights, bumper, grille */}
      <rect x="21" y="48" width="4" height="9" rx="2" fill="#EF4444" />
      <rect x="150" y="63" width="9" height="8" rx="3" fill="#FEF9C3" stroke="#10B981" strokeWidth="1.2" />
      <rect x="148" y="82" width="14" height="6" rx="3" fill="#6EE7B7" />
      <rect x="122" y="75" width="24" height="3" rx="1.5" fill="#86EFAC" />
      <rect x="122" y="81" width="20" height="3" rx="1.5" fill="#86EFAC" />
    </g>

    {[52, 132].map((cx) => (
      <g key={cx} className="wheel fb">
        <circle cx={cx} cy="91" r="12.5" fill="url(#ambTire)" />
        <circle cx={cx} cy="91" r="7" fill="url(#ambHub)" />
        {[0, 72, 144, 216, 288].map((a) => (
          <line key={a} x1={cx} y1="91" x2={cx} y2="85" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${a} ${cx} 91)`} />
        ))}
        <circle cx={cx} cy="91" r="1.8" fill="#065F46" />
      </g>
    ))}
  </svg>
);

/** Level 1: glass siren dome with a rotating beam */
const SirenIllustration: React.FC = () => (
  <svg viewBox="0 0 88 88" className="w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 drop-shadow-[0_8px_8px_rgba(185,28,28,0.28)]" aria-hidden="true">
    <defs>
      <radialGradient id="sirenDome" cx="36%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FECACA" />
        <stop offset="40%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#7F1D1D" />
      </radialGradient>
      <linearGradient id="sirenBase" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#B91C1C" />
        <stop offset="100%" stopColor="#450A0A" />
      </linearGradient>
      <clipPath id="sirenClip">
        <path d="M25 60V42C25 31.5 33.5 23 44 23C54.5 23 63 31.5 63 42V60H25Z" />
      </clipPath>
    </defs>
    <ellipse cx="44" cy="76" rx="28" ry="4" fill="#450A0A" opacity="0.22" />
    <g className="rays" stroke="#EF4444" strokeWidth="3.2" strokeLinecap="round">
      <line x1="44" y1="5" x2="44" y2="14" />
      <line x1="19" y1="15" x2="25" y2="21" />
      <line x1="69" y1="15" x2="63" y2="21" />
      <line x1="9" y1="38" x2="18" y2="38" />
      <line x1="79" y1="38" x2="70" y2="38" />
    </g>
    <path d="M25 60V42C25 31.5 33.5 23 44 23C54.5 23 63 31.5 63 42V60H25Z" fill="url(#sirenDome)" />
    <g clipPath="url(#sirenClip)">
      <g className="beam" style={{ transformOrigin: '44px 48px' }}>
        <polygon points="44,48 78,26 78,48" fill="#FFFFFF" opacity="0.5" />
      </g>
      <circle cx="44" cy="48" r="7" fill="#FEE2E2" className="rays" />
    </g>
    <path d="M32 49V41C32 35.5 35.5 31 40.5 29" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
    <rect x="19" y="59" width="50" height="11" rx="5" fill="url(#sirenBase)" />
    <rect x="23" y="61" width="42" height="2.5" rx="1.25" fill="#F87171" opacity="0.7" />
  </svg>
);

/** Level 2: stethoscope with metallic chest piece (sways on hover) */
const StethoscopeIllustration: React.FC = () => (
  <svg viewBox="0 0 88 88" className="w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 drop-shadow-[0_8px_8px_rgba(6,78,59,0.25)]" aria-hidden="true">
    <defs>
      <linearGradient id="stTube" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#064E3B" />
      </linearGradient>
      <radialGradient id="stChest" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#FCA5A5" />
        <stop offset="55%" stopColor="#DC2626" />
        <stop offset="100%" stopColor="#7F1D1D" />
      </radialGradient>
    </defs>
    <g className="sway" style={{ transformOrigin: '37px 16px' }}>
      <path d="M26 16H21C19 16 17.5 17.5 17.5 19.5V34C17.5 46 25.5 55 37 55C48.5 55 56.5 46 56.5 34V19.5C56.5 17.5 55 16 53 16H48" fill="none" stroke="url(#stTube)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 55V64C37 71.5 43 77 50.5 77H54C62.5 77 69 70.5 69 62V49" fill="none" stroke="url(#stTube)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M19.5 20V34C19.5 44 25 51 34 53.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="27" cy="16" r="4" fill="url(#stChest)" />
      <circle cx="47" cy="16" r="4" fill="url(#stChest)" />
      <circle cx="69" cy="43" r="11.5" fill="#064E3B" />
      <circle cx="69" cy="43" r="9.5" fill="url(#stChest)" />
      <circle cx="69" cy="43" r="5.8" fill="#FEF2F2" />
      <circle cx="69" cy="43" r="2.8" fill="#10B981" />
      <path d="M62.5 38.5C64 36 66.5 34.8 69 34.8" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
    </g>
  </svg>
);

/** Level 3: 3D house with a visible side wall and roof plane */
const HomeCareIllustration: React.FC = () => (
  <svg viewBox="0 0 88 88" className="w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 drop-shadow-[0_8px_8px_rgba(6,78,59,0.22)]" aria-hidden="true">
    <defs>
      <linearGradient id="hWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#D1FAE5" />
      </linearGradient>
      <linearGradient id="hSide" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#A7F3D0" />
        <stop offset="100%" stopColor="#34D399" />
      </linearGradient>
      <linearGradient id="hRoof" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#34D399" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="hRoofSide" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#059669" />
        <stop offset="100%" stopColor="#064E3B" />
      </linearGradient>
    </defs>
    <ellipse cx="44" cy="79" rx="30" ry="4.5" fill="#064E3B" opacity="0.2" />
    <g className="house fb">
      <polygon points="64,46 76,40 76,70 64,76" fill="url(#hSide)" />
      <rect x="16" y="46" width="48" height="30" rx="1.5" fill="url(#hWall)" stroke="#A7F3D0" strokeWidth="1.5" />
      <polygon points="40,16 52,9 82,40 70,46" fill="url(#hRoofSide)" />
      <polygon points="10,46 40,16 70,46" fill="url(#hRoof)" />
      <polygon points="40,16 52,9 50,11 40,19" fill="#FFFFFF" opacity="0.35" />
      <rect x="38.2" y="26" width="3.6" height="13" rx="1.2" fill="#FFFFFF" />
      <rect x="33.5" y="30.7" width="13" height="3.6" rx="1.2" fill="#FFFFFF" />
      <rect x="34" y="56" width="14" height="20" rx="3" fill="#047857" />
      <circle cx="45" cy="66" r="1.6" fill="#D1FAE5" />
      <rect x="19" y="53" width="10" height="10" rx="2" fill="#6EE7B7" stroke="#10B981" />
      <rect x="53" y="53" width="8" height="10" rx="2" fill="#6EE7B7" stroke="#10B981" />
    </g>
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export const EmergencyDirectoryView: React.FC<EmergencyDirectoryViewProps> = React.memo(({ lang }) => {
  const isAr = lang === 'ar';
  const tilt = useTilt(7);
  const tiltSoft = useTilt(10);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<string>('EG');
  const [expandedTriageLevel, setExpandedTriageLevel] = useState<number | null>(null);
  const [shownLevel, setShownLevel] = useState<number>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [ambOn, setAmbOn] = useState(false);

  const selectedContact = useMemo(
    () => EMERGENCY_CONTACTS.find((c) => c.code === selectedCode) || EMERGENCY_CONTACTS[0],
    [selectedCode]
  );

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = !q
      ? [...EMERGENCY_CONTACTS]
      : EMERGENCY_CONTACTS.filter(
          (c) =>
            c.country.toLowerCase().includes(q) ||
            c.countryEn.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            c.ambulance.includes(q) ||
            c.police.includes(q) ||
            c.fire.includes(q)
        );
    const rank = (code: string) => {
      const i = COUNTRY_ORDER.indexOf(code);
      return i === -1 ? 99 : i;
    };
    return list.sort((a, b) => rank(a.code) - rank(b.code));
  }, [searchQuery]);

  const handleCopy = async (e: React.MouseEvent, key: string, number: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(number);
    } catch {
      const el = document.createElement('textarea');
      el.value = number;
      el.setAttribute('readonly', '');
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  const activeTriage = useMemo(() => TRIAGE_LEVELS.find((t) => t.level === shownLevel) || null, [shownLevel]);
  const drawerOpen = expandedTriageLevel !== null;

  const toggleLevel = (level: number) => {
    if (expandedTriageLevel === level) {
      setExpandedTriageLevel(null);
    } else {
      setShownLevel(level);
      setExpandedTriageLevel(level);
    }
  };

  /** Red & green shades only */
  const triageMeta = [
    {
      level: 1,
      titleAr: 'طوارئ فورية',
      titleEn: 'Immediate Emergency',
      subtitleAr: 'حالات خطيرة',
      subtitleEn: 'Critical cases',
      badgeClass: 'bg-gradient-to-b from-red-500 to-red-700 text-white',
      cardClass:
        'bg-gradient-to-br from-red-100/80 via-red-50/60 to-white dark:from-red-950/40 dark:via-slate-900 dark:to-slate-900 border-red-200/80 dark:border-red-900/60 hover:border-red-400 hover:shadow-[0_18px_30px_rgba(220,38,38,0.18)]',
      activeRing: 'ring-2 ring-red-400/70 border-red-400',
      arrowClass: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300',
      illustration: <SirenIllustration />,
    },
    {
      level: 2,
      titleAr: 'روح لدكتور',
      titleEn: 'See a Doctor',
      subtitleAr: 'حالات متوسطة',
      subtitleEn: 'Moderate cases',
      badgeClass: 'bg-gradient-to-b from-rose-500 to-red-700 text-white',
      cardClass:
        'bg-gradient-to-br from-rose-100/70 via-white to-emerald-100/60 dark:from-rose-950/30 dark:via-slate-900 dark:to-emerald-950/30 border-rose-200/80 dark:border-rose-900/50 hover:border-rose-400 hover:shadow-[0_18px_30px_rgba(225,29,72,0.16)]',
      activeRing: 'ring-2 ring-rose-400/70 border-rose-400',
      arrowClass: 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300',
      illustration: <StethoscopeIllustration />,
    },
    {
      level: 3,
      titleAr: 'عناية في البيت',
      titleEn: 'Home Care',
      subtitleAr: 'معلومات بسيطة',
      subtitleEn: 'Mild & routine info',
      badgeClass: 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white',
      cardClass:
        'bg-gradient-to-br from-emerald-100/80 via-emerald-50/60 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 border-emerald-200/80 dark:border-emerald-900/60 hover:border-emerald-400 hover:shadow-[0_18px_30px_rgba(5,150,105,0.18)]',
      activeRing: 'ring-2 ring-emerald-400/70 border-emerald-400',
      arrowClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300',
      illustration: <HomeCareIllustration />,
    },
  ];

  const DirectionalChevron = isAr ? ChevronLeft : ChevronRight;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="edv w-full min-h-full flex items-center justify-center bg-white dark:bg-slate-950 text-start"
    >
      <style>{EDV_CSS}</style>

      <div className="w-full max-w-5xl px-3 sm:px-6 py-8 space-y-5">
        {/* 1. Hero: shield + title | ECG line | ambulance */}
        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 self-start sm:self-center z-10">
            <div className="tilt rounded-2xl" {...tiltSoft}>
              <div className="z2">
                <MedicalShieldEmblem />
              </div>
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                {isAr ? 'دليل الطوارئ' : 'Emergency Directory'}
              </h1>
              <p className="text-xs sm:text-base font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'معلومات سريعة وقت الحاجة' : 'Quick information when you need it'}
              </p>
            </div>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center px-4" aria-hidden="true">
            <svg viewBox="0 0 220 48" className="w-full max-w-[230px] h-12">
              <defs>
                <linearGradient id="ecgFade" x1="0" y1="0" x2="1" y2="0">
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
                stroke="url(#ecgFade)"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <button
            type="button"
            onClick={() => setAmbOn((v) => !v)}
            aria-label={isAr ? 'سيارة إسعاف' : 'Ambulance'}
            className={`amb ${ambOn ? 'on' : ''} hidden sm:flex items-end justify-end -mb-3 z-0 bg-transparent border-0 p-0 floaty focus-visible:outline-2 focus-visible:outline-red-500 rounded-xl`}
          >
            <AmbulanceIllustration mirrored={!isAr} />
          </button>
        </div>

        {/* 2. Red life-threatening banner */}
        <div className="relative z-10 overflow-hidden rounded-[26px] bg-gradient-to-l from-red-700 via-red-600 to-rose-500 text-white px-5 sm:px-8 py-5 sm:py-6 shadow-[0_0_26px_rgba(220,38,38,0.18),0_14px_32px_rgba(220,38,38,0.25),inset_0_1px_0_rgba(255,255,255,0.35)]">
          <div aria-hidden="true" className="pointer-events-none absolute -top-12 -start-10 w-44 h-44 rounded-full bg-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 end-1/4 w-56 h-56 rounded-full bg-red-900/20" />

          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-b from-white/25 to-white/5 border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_8px_16px_rgba(127,29,29,0.35)] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 56 52" className="w-10 h-10 sm:w-11 sm:h-11 drop-shadow-[0_3px_3px_rgba(127,29,29,0.4)]" aria-hidden="true">
                <path d="M28 4L52 46H4L28 4Z" fill="#FFFFFF" fillOpacity="0.92" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" />
                <rect x="26" y="18" width="4" height="14" rx="2" fill="#DC2626" />
                <circle cx="28" cy="38" r="2.4" fill="#DC2626" />
              </svg>
            </div>

            <div className="flex-1 text-center">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug drop-shadow-[0_2px_2px_rgba(127,29,29,0.35)]">
                {isAr ? 'لو في خطر على حياتك!' : 'If your life is in danger!'}
              </h2>
              <p className="text-xs sm:text-sm text-red-50/95 font-medium mt-0.5">
                {isAr
                  ? `تواصل فوراً بالإسعاف (${selectedContact.country})`
                  : `Contact ambulance immediately (${selectedContact.countryEn})`}
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-center">
              <svg viewBox="0 0 18 28" className="w-4 h-6 text-white/65 hidden sm:block rays" aria-hidden="true">
                <path d="M14 4L4 10M15 14L3 14M14 24L4 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>

              <div className="relative">
                <span aria-hidden="true" className="ring pointer-events-none absolute inset-0 rounded-full border-2 border-white/70" />
                <a
                  href={`tel:${selectedContact.ambulance}`}
                  className="relative inline-flex items-center justify-center gap-2.5 bg-gradient-to-b from-white to-red-50 text-red-600 font-black px-7 sm:px-9 py-3 rounded-full text-base sm:text-xl whitespace-nowrap shrink-0 shadow-[0_5px_0_rgba(153,27,27,0.45),0_14px_22px_rgba(127,29,29,0.3)] hover:shadow-[0_7px_0_rgba(153,27,27,0.45),0_18px_26px_rgba(127,29,29,0.32)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_rgba(153,27,27,0.45),0_4px_8px_rgba(127,29,29,0.3)] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="tabular-nums">
                    {isAr ? `اتصل بـ ${selectedContact.ambulance}` : `Call ${selectedContact.ambulance}`}
                  </span>
                  <PhoneCall className="w-5 h-5 shrink-0" />
                </a>
              </div>

              <svg viewBox="0 0 18 28" className="w-4 h-6 text-white/65 hidden sm:block -scale-x-100 rays" aria-hidden="true">
                <path d="M14 4L4 10M15 14L3 14M14 24L4 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* 3. Triage level cards */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
            {triageMeta.map((card) => {
              const isExpanded = expandedTriageLevel === card.level;
              return (
                <button
                  key={card.level}
                  type="button"
                  onClick={() => toggleLevel(card.level)}
                  aria-expanded={isExpanded}
                  {...tilt}
                  className={`tilt grp rounded-[22px] border p-4 sm:p-5 text-start cursor-pointer shadow-[0_0_20px_rgba(15,23,42,0.065),0_6px_18px_rgba(15,23,42,0.06)] dark:shadow-[0_0_20px_rgba(0,0,0,0.32),0_6px_18px_rgba(0,0,0,0.28)] flex items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-emerald-500 ${card.cardClass} ${
                    isExpanded ? card.activeRing : ''
                  }`}
                >
                  <div className="shrink-0 z2">{card.illustration}</div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-3 z1">
                    <div className="flex items-center justify-end">
                      <span
                        className={`inline-flex items-center px-3.5 py-0.5 rounded-full text-[0.72rem] font-bold whitespace-nowrap shadow-[0_3px_6px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.35)] ${card.badgeClass}`}
                      >
                        {isAr ? `المستوى ${card.level}` : `Level ${card.level}`}
                      </span>
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                          {isAr ? card.titleAr : card.titleEn}
                        </h3>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {isAr ? card.subtitleAr : card.subtitleEn}
                        </p>
                      </div>

                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-[0_3px_6px_rgba(15,23,42,0.12)] transition-transform duration-200 ${card.arrowClass} ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      >
                        <DirectionalChevron className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Animated guidance drawer */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
              drawerOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
            aria-hidden={!drawerOpen}
          >
            <div className="overflow-hidden">
              {activeTriage && (
                <div
                  className={`rounded-2xl border p-4 sm:p-5 shadow-[0_0_20px_rgba(15,23,42,0.06),0_6px_18px_rgba(15,23,42,0.05)] ${
                    activeTriage.level === 1
                      ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
                      : activeTriage.level === 2
                      ? 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200 dark:border-rose-900/50'
                      : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <p
                      className={`text-sm font-extrabold ${
                        activeTriage.level === 3 ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'
                      }`}
                    >
                      {isAr ? activeTriage.actionAr : activeTriage.actionEn}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpandedTriageLevel(null)}
                      tabIndex={drawerOpen ? 0 : -1}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer shrink-0"
                      aria-label={isAr ? 'إغلاق التفاصيل' : 'Close details'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                    {(isAr ? activeTriage.examplesAr : activeTriage.examplesEn).map((ex, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            activeTriage.level === 3 ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                        />
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Emergency numbers directory */}
        <div className="rounded-[26px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_0_24px_rgba(15,23,42,0.075),0_8px_24px_rgba(15,23,42,0.06)] dark:shadow-[0_0_24px_rgba(0,0,0,0.35),0_8px_24px_rgba(0,0,0,0.3)] p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-gradient-to-b from-emerald-100 to-emerald-200 dark:from-emerald-950/60 dark:to-emerald-900/60 text-emerald-700 dark:text-emerald-400 shadow-[0_3px_6px_rgba(5,150,105,0.25)] flex items-center justify-center shrink-0">
                <Globe className="w-[18px] h-[18px]" />
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {isAr ? 'أرقام الطوارئ حولك' : 'Emergency Numbers Around You'}
              </h2>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'ابحث عن دولة أو رقم...' : 'Search country or number...'}
                className="w-full text-xs sm:text-sm py-2.5 ps-10 pe-4 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white placeholder:text-slate-400 shadow-[inset_0_2px_4px_rgba(15,23,42,0.05)] focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          {filteredContacts.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'لم يتم العثور على دول مطابقة للبحث.' : 'No matching countries or numbers found.'}
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
              >
                {isAr ? 'عرض جميع الدول' : 'Show all countries'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {filteredContacts.map((contact) => {
                const isSelected = selectedContact.code === contact.code;
                const copyKey = `${contact.code}-${contact.ambulance}`;
                const isCopied = copiedKey === copyKey;

                return (
                  <div
                    key={contact.code}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCode(contact.code)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCode(contact.code);
                      }
                    }}
                    aria-pressed={isSelected}
                    {...tilt}
                    className={`tilt rounded-2xl p-4 cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                      isSelected
                        ? 'border-2 border-red-400 dark:border-red-500 bg-gradient-to-br from-red-50/80 via-white to-white dark:from-red-950/35 dark:via-slate-900 dark:to-slate-900 shadow-[0_0_18px_rgba(220,38,38,0.14),0_10px_24px_rgba(220,38,38,0.14)]'
                        : 'border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-[0_0_14px_rgba(15,23,42,0.055),0_4px_12px_rgba(15,23,42,0.05)] hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-[0_0_18px_rgba(15,23,42,0.08),0_14px_26px_rgba(15,23,42,0.12)]'
                    }`}
                  >
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="pop z2 absolute top-3 end-3 w-6 h-6 rounded-full bg-gradient-to-b from-red-500 to-red-700 text-white flex items-center justify-center shadow-[0_4px_8px_rgba(185,28,28,0.45)]"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}

                    <div className="flex items-center gap-2.5 z1">
                      <CountryFlag code={contact.code} />
                      <span className="text-sm sm:text-[0.9375rem] font-extrabold text-slate-900 dark:text-white truncate">
                        {isAr ? contact.country : contact.countryEn}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 z2">
                      <button
                        type="button"
                        onClick={(e) => handleCopy(e, copyKey, contact.ambulance)}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer active:scale-90 ${
                          isCopied
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                            : 'text-emerald-600/70 hover:text-emerald-700 dark:text-emerald-400/70 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                        title={isAr ? 'نسخ رقم الإسعاف' : 'Copy ambulance number'}
                        aria-label={isAr ? 'نسخ رقم الإسعاف' : 'Copy ambulance number'}
                      >
                        {isCopied ? <Check key="ok" className="pop w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>

                      <a
                        href={`tel:${contact.ambulance}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-black text-2xl tracking-tight tabular-nums drop-shadow-[0_3px_3px_rgba(220,38,38,0.22)] transition-colors"
                        title={isAr ? `اتصال بإسعاف ${contact.country}` : `Call ${contact.countryEn} ambulance`}
                      >
                        <span>{contact.ambulance}</span>
                        <PhoneCall className="w-4 h-4 shrink-0" />
                      </a>
                    </div>

                    <div className="z1 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[0.72rem] text-slate-600 dark:text-slate-300 font-medium">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{isAr ? 'الشرطة' : 'Police'}</span>
                        <b className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{contact.police}</b>
                      </span>

                      <span className="text-slate-200 dark:text-slate-700 select-none" aria-hidden="true">
                        |
                      </span>

                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Flame className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0" />
                        <span>{isAr ? 'المطافئ' : 'Fire'}</span>
                        <b className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{contact.fire}</b>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});