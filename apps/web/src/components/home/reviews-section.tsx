'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import type { LatestReviewDto } from '@/lib/types';

/** Сколько раз повторяем список, чтобы лента выглядела бесконечной. */
const COPIES = 3;

/**
 * За один непрерывный жест колесом лента прокручивается примерно на столько
 * пикселей, после чего управление возвращается странице. Без этого клапана
 * закольцованная лента поймала бы страницу в ловушку: конца у неё нет, и
 * прокрутить дальше вниз было бы невозможно.
 */
const WHEEL_BUDGET = 1400;
const GESTURE_PAUSE = 400;

export function ReviewsSection({ reviews }: { reviews: LatestReviewDto[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const wheelSpent = useRef(0);
  const lastWheel = useRef(0);

  /** Держим позицию в средней копии: слева и справа всегда есть запас. */
  const normalize = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const setWidth = el.scrollWidth / COPIES;
    if (setWidth <= 0) return;
    if (el.scrollLeft < setWidth * 0.5) el.scrollLeft += setWidth;
    else if (el.scrollLeft > setWidth * 1.5) el.scrollLeft -= setWidth;
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || reviews.length === 0) return;

    // Стартуем со второй копии, чтобы пролистывание влево работало сразу.
    el.scrollLeft = el.scrollWidth / COPIES;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const now = performance.now();
      if (now - lastWheel.current > GESTURE_PAUSE) wheelSpent.current = 0;
      lastWheel.current = now;

      if (wheelSpent.current >= WHEEL_BUDGET) return; // клапан: дальше листает страница

      wheelSpent.current += Math.abs(event.deltaY);
      event.preventDefault();
      el.scrollLeft += event.deltaY;
      normalize();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [reviews.length, normalize]);

  const scrollByCard = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('figure');
    const step = card ? card.clientWidth + 40 : 420;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
    // Нормализуем и здесь: полагаться только на событие прокрутки не стоит,
    // плавная прокрутка завершается асинхронно.
    window.setTimeout(normalize, 600);
  };

  if (reviews.length === 0) return null;

  const arrowCls =
    'flex h-12 w-12 cursor-pointer items-center justify-center border border-line-strong text-ink ' +
    'transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-ink hover:bg-ink hover:text-bg';

  const loop = Array.from({ length: COPIES }, (_, copy) =>
    reviews.map((review) => ({ review, key: `${copy}-${review.id}` })),
  ).flat();

  return (
    <section className="bg-surface-soft py-28 md:py-40">
      <Container className="!max-w-[104rem]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading eyebrow="Отзывы" title="Что говорят гости" />
          <div className="hidden shrink-0 gap-3 sm:flex">
            <button onClick={() => scrollByCard(-1)} aria-label="Предыдущие отзывы" className={arrowCls}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14.5 6 8.5 12l6 6" />
              </svg>
            </button>
            <button onClick={() => scrollByCard(1)} aria-label="Следующие отзывы" className={arrowCls}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </Container>

      <div
        ref={trackRef}
        onScroll={normalize}
        className="no-scrollbar mt-16 flex gap-10 overflow-x-auto px-4 sm:px-6 lg:mt-24 lg:px-[max(2rem,calc((100vw-104rem)/2))]"
      >
        {loop.map(({ review, key }, index) => (
          <figure
            key={key}
            aria-hidden={index >= reviews.length ? true : undefined}
            className="border-line flex w-[82vw] max-w-md shrink-0 flex-col border-t pt-8"
          >
            {/* Оценка цифрой, а не россыпью звёзд: в монохроме звёзды шумят */}
            <p className="kicker-plain text-faint">{review.rating},0 из 5</p>
            <blockquote className="font-display text-ink mt-6 flex-1 text-[1.375rem] leading-[1.5]">
              «{review.text}»
            </blockquote>
            <figcaption className="mt-8">
              <p className="text-ink text-sm font-medium">{review.authorName}</p>
              <Link
                href={`/excursions/${review.tour.slug}`}
                tabIndex={index >= reviews.length ? -1 : undefined}
                className="link-underline text-muted mt-1 inline-block text-sm"
              >
                {review.tour.title}
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
