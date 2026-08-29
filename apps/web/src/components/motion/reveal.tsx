'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Плавное появление блока при попадании во вьюпорт.
 *
 * Скрытие живёт в CSS под классом js-motion, который проставляется до первой
 * отрисовки только при живом JS. Раньше начальное состояние приходило
 * inline-стилем прямо в серверной разметке, и без JS блоки оставались
 * невидимыми навсегда — теперь в этом случае контент просто виден сразу.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Страховка: если наблюдатель недоступен, показываем сразу.
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}s` } : undefined}>
      {children}
    </div>
  );
}
