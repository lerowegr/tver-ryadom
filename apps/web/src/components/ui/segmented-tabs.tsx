'use client';

/** Изинг в духе «easy ease» из After Effects. */
export const smoothEase = [0.22, 1, 0.36, 1] as const;

/**
 * Переключатель-«пилюля»: активный фон плавно переезжает между вкладками.
 *
 * Раньше перетекание делал layoutId из motion — ради одного этого эффекта
 * в бандл попадала вся библиотека (119 КБ). Теперь это одна абсолютная
 * плашка, которую двигает transform: тот же эффект, ноль зависимостей.
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
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const share = 100 / options.length;

  return (
    <div
      className={`border-line relative inline-flex border ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden
        className="bg-ink absolute inset-y-0 left-0 transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `${share}%`, transform: `translateX(${index * 100}%)` }}
      />
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
