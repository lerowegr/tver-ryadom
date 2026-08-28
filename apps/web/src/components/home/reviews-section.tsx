'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import type { LatestReviewDto } from '@/lib/types';

export function ReviewsSection({ reviews }: { reviews: LatestReviewDto[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [reviews.length]);

  const scrollByCard = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('figure');
    const step = card ? card.clientWidth + 40 : 420;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  if (reviews.length === 0) return null;

  const arrowCls =
    'flex h-12 w-12 cursor-pointer items-center justify-center border border-line-strong text-ink ' +
    'transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-ink hover:bg-ink hover:text-bg ' +
    'disabled:pointer-events-none disabled:opacity-25';

  return (
    <section className="bg-surface-soft py-28 md:py-40">
      <Container className="!max-w-[104rem]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading eyebrow="Отзывы" title="Что говорят гости" />
          <div className="hidden shrink-0 gap-3 sm:flex">
            <button onClick={() => scrollByCard(-1)} disabled={!canPrev} aria-label="Предыдущие отзывы" className={arrowCls}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14.5 6 8.5 12l6 6" />
              </svg>
            </button>
            <button onClick={() => scrollByCard(1)} disabled={!canNext} aria-label="Следующие отзывы" className={arrowCls}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </Container>

      <div
        ref={trackRef}
        onScroll={updateArrows}
        className="no-scrollbar mt-16 flex snap-x snap-mandatory gap-10 overflow-x-auto scroll-smooth px-4 sm:px-6 lg:mt-24 lg:px-[max(2rem,calc((100vw-104rem)/2))]"
      >
        {reviews.map((review) => (
          <figure
            key={review.id}
            className="border-line flex w-[82vw] max-w-md shrink-0 snap-start flex-col border-t pt-8"
          >
            {/* Оценка цифрой, а не россыпью звёзд: в монохроме звёзды шумят */}
            <p className="kicker-plain text-faint">
              {review.rating},0 из 5
            </p>
            <blockquote className="font-display text-ink mt-6 flex-1 text-[1.375rem] leading-[1.5]">
              «{review.text}»
            </blockquote>
            <figcaption className="mt-8">
              <p className="text-ink text-sm font-medium">{review.authorName}</p>
              <Link
                href={`/excursions/${review.tour.slug}`}
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
