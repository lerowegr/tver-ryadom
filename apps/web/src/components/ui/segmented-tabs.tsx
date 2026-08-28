'use client';

import { motion } from 'motion/react';
import { useId } from 'react';

/** Изинг в духе «easy ease» из After Effects. */
export const smoothEase = [0.22, 1, 0.36, 1] as const;

/**
 * Переключатель-«пилюля»: активный фон плавно перетекает между вкладками
 * (motion layoutId), а не переключается скачком.
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
  const groupId = useId();

  return (
    <div className={`border-line inline-flex border ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className="relative flex-1 cursor-pointer px-6 py-3.5 text-[0.6875rem] font-medium tracking-[0.18em] whitespace-nowrap uppercase"
          >
            {active ? (
              <motion.span
                layoutId={`segment-${groupId}`}
                className="bg-ink absolute inset-0"
                transition={{ duration: 0.45, ease: smoothEase }}
              />
            ) : null}
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
