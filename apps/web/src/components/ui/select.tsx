import type { SelectHTMLAttributes } from 'react';

/**
 * Селект с собственной стрелочкой: нативный appearance прячем, чтобы стрелка
 * не прилипала к границе и всегда стояла по центру своей зоны.
 */
export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        {...rest}
        className="border-sand-300 text-bark-800 focus:outline-terra-500 disabled:text-bark-500/60 w-full cursor-pointer appearance-none rounded-full border bg-white py-2.5 pr-10 pl-4 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="text-bark-600 pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6.5 4 4 4-4" />
      </svg>
    </span>
  );
}
