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
    <div className={`bg-cream-200 inline-flex rounded-full p-1 ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className="relative flex-1 rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap"
          >
            {active ? (
              <motion.span
                layoutId={`segment-${groupId}`}
                className="shadow-card absolute inset-0 rounded-full bg-white"
                transition={{ duration: 0.45, ease: smoothEase }}
              />
            ) : null}
            <span
              className={`relative z-10 transition-colors duration-300 ${
                active ? 'text-ink-900' : 'text-bark-600 hover:text-bark-800'
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
