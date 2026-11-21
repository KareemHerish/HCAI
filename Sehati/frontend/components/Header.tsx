/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PhoneCall } from 'lucide-react';
import { Language } from '../types';

interface HeaderProps {
  lang: Language;
}

export const Header: React.FC<HeaderProps> = ({ lang }) => {
  const isAr = lang === 'ar';

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-950 shadow-xs transition-colors shrink-0">
      {/* Quick Emergency Call Bar */}
      <div className="bg-red-600 text-white text-sm py-2.5 px-4 sm:px-5 font-bold flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
          </span>
          <span>{isAr ? 'حالة طارئة؟ اطلب الإسعاف دلوقتي' : 'Emergency? Call 123 now'}</span>
        </div>
        <a
          href="tel:123"
          className="flex items-center gap-1.5 bg-white text-red-600 font-black px-3.5 py-1 rounded-full text-xs sm:text-sm hover:bg-red-50 transition-colors shadow-xs"
        >
          <PhoneCall className="w-4 h-4" />
          <span>{isAr ? 'اتصل 123' : 'Call 123'}</span>
        </a>
      </div>
    </header>
  );
};
