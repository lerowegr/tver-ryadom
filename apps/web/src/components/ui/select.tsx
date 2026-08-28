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
        className="border-line text-ink focus:border-ink focus:outline-none disabled:text-faint w-full cursor-pointer appearance-none border bg-transparent py-3 pr-10 pl-4 text-[0.6875rem] font-medium tracking-[0.14em] uppercase transition-colors duration-500 disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="text-muted pointer-events-none absolute top-1/2 right-3.5 h-3.5 w-3.5 -translate-y-1/2"
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
