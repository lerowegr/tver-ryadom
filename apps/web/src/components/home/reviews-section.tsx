'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Container } from '@/components/ui/container';
import { RatingStars } from '@/components/ui/rating-stars';
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
    const step = card ? card.clientWidth + 20 : 360;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  if (reviews.length === 0) return null;

  const arrowCls =
    'flex h-11 w-11 items-center justify-center rounded-full border border-sand-300 bg-white text-bark-700 ' +
    'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-terra-500 hover:text-terra-600 ' +
    'active:scale-90 disabled:opacity-30 disabled:pointer-events-none';

  return (
    <section className="bg-cream-100 py-20 md:py-28">
      <Container>
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Отзывы"
            title="Что говорят наши гости"
            subtitle="Настоящие впечатления людей, которые уже прогулялись с нами по Твери."
          />
          <div className="mb-10 hidden shrink-0 gap-3 sm:flex md:mb-14">
            <button onClick={() => scrollByCard(-1)} disabled={!canPrev} aria-label="Предыдущие отзывы" className={arrowCls}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14.5 6 8.5 12l6 6" />
              </svg>
            </button>
            <button onClick={() => scrollByCard(1)} disabled={!canNext} aria-label="Следующие отзывы" className={arrowCls}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </Container>
      <div
        ref={trackRef}
        onScroll={updateArrows}
        className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 sm:px-6 lg:px-[max(2rem,calc((100vw-72rem)/2))]"
      >
        {reviews.map((review) => (
          <figure
            key={review.id}
            className="shadow-card flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-3xl bg-white p-7"
          >
            <RatingStars rating={review.rating} />
            <blockquote className="text-bark-800 mt-4 flex-1 leading-relaxed">
              «{review.text}»
            </blockquote>
            <figcaption className="border-cream-200 mt-5 border-t pt-4">
              <p className="text-ink-900 font-semibold">{review.authorName}</p>
              <Link
                href={`/excursions/${review.tour.slug}`}
                className="text-terra-600 text-sm hover:underline"
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
