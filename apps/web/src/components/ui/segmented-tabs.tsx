'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Изинг в духе «easy ease» из After Effects. */
export const smoothEase = [0.22, 1, 0.36, 1] as const;

/**
 * Переключатель-«пилюля»: активный фон плавно переезжает между вкладками.
 *
 * Положение и ширина плашки измеряются по самой кнопке. Раньше плашке
 * задавалась ровная доля ширины — сто процентов, делённые на число вкладок, —
 * но вкладки получают ширину по своему тексту и равными не выходят:
 * «Предстоящие» шире, чем «Все», и плашка обрезала слово.
 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const measure = useCallback(() => {
    const el = tabs.current[index];
    if (!el) return;
    setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [index]);

  useEffect(() => {
    measure();
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Ширина вкладок меняется вместе с шириной страницы и после подгрузки шрифта.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={wrap}
      className={`border-line relative inline-flex border ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {/* До первого замера плашки нет: показать её в неверном месте хуже,
          чем показать на кадр позже. */}
      {box ? (
        <span
          aria-hidden
          className="bg-ink absolute inset-y-0 left-0 transition-[transform,width] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: box.width, transform: `translateX(${box.left}px)` }}
        />
      ) : null}
      {options.map((option, i) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className="relative flex-1 cursor-pointer px-6 py-3.5 text-[0.6875rem] font-medium tracking-[0.18em] whitespace-nowrap uppercase"
          >
            <span
              className={`relative z-10 transition-colors duration-300 ${
                active ? 'text-bg' : 'text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
