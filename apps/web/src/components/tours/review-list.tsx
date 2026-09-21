'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';
import type { ReviewDto } from '@/lib/types';

/**
 * Отзывы на странице экскурсии.
 *
 * Их набралось два десятка — перенесены с Авито и Спутника. Вываливать их
 * все сразу значит отодвинуть форму бронирования на экран вниз, а прятать
 * за постраничной навигацией — заставлять уходить со страницы ради чтения.
 * Поэтому первые несколько видны всегда, остальные раскрываются на месте.
 */

/** Сколько отзывов видно до раскрытия. */
const PREVIEW = 4;

export function ReviewList({ reviews, total }: { reviews: ReviewDto[]; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = reviews.length - PREVIEW;
  const shown = expanded ? reviews : reviews.slice(0, PREVIEW);

  return (
    <>
      <ul className="border-line border-t">
        {shown.map((review) => (
          <li key={review.id} className="border-line border-b py-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-ink text-sm font-medium">{review.authorName}</p>
              <p className="kicker-plain text-faint">
                {review.rating},0 из 5 · {formatDate(review.createdAt)}
              </p>
            </div>
            <p className="text-muted mt-4 text-sm leading-[1.8]">{review.text}</p>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="link-underline text-muted hover:text-ink mt-6 cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
        >
          {expanded ? 'Свернуть отзывы' : `Показать все ${total}`}
        </button>
      ) : null}
    </>
  );
}
