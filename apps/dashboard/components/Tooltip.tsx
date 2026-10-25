'use client';

import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'center' | 'left' | 'right';
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  align = 'center',
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Determine horizontal alignment offset to prevent right-edge screen shifts
  let horizontalClass = 'left-1/2 -translate-x-1/2';
  let arrowHorizontalClass = 'left-1/2 -translate-x-1/2';

  if (align === 'right') {
    horizontalClass = 'right-0 translate-x-0';
    arrowHorizontalClass = 'right-3';
  } else if (align === 'left') {
    horizontalClass = 'left-0 translate-x-0';
    arrowHorizontalClass = 'left-3';
  }

  const positionClasses = {
    top: `bottom-full ${horizontalClass} mb-2`,
    bottom: `top-full ${horizontalClass} mt-2`,
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: `top-full ${arrowHorizontalClass} border-t-zinc-900 dark:border-t-zinc-800 border-l-transparent border-r-transparent border-b-transparent`,
    bottom: `bottom-full ${arrowHorizontalClass} border-b-zinc-900 dark:border-b-zinc-800 border-l-transparent border-r-transparent border-t-transparent`,
    left: 'left-full top-1/2 -translate-y-1/2 border-l-zinc-900 dark:border-l-zinc-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-zinc-900 dark:border-r-zinc-800 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}

      {isVisible && (
        <div
          role="tooltip"
          className={`absolute ${positionClasses[position]} z-50 pointer-events-none w-max max-w-[210px] sm:max-w-[240px] px-2.5 py-1.5 text-[11px] font-medium leading-snug text-center text-white bg-zinc-900 dark:bg-zinc-800 border border-zinc-700/80 rounded-md shadow-xl whitespace-normal break-words animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md`}
        >
          {content}
          <div className={`absolute border-4 ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
}
