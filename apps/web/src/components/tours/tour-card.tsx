import Link from 'next/link';
import { FavoriteButton } from '@/components/tours/favorite-button';
import { TourVisual } from '@/components/tours/tour-visual';
import { formatDuration, groupLabel, primaryBadge, priceLabel } from '@/lib/format';
import type { TourCardDto } from '@/lib/types';

/**
 * Карточка каталога в языке референса: портретное фото 4:5 без рамки,
 * подпись слева под ним. Ни контейнера, ни тени, ни скруглений —
 * карточку держит сетка и воздух, а не «плашка».
 */
export function TourCard({ tour }: { tour: TourCardDto }) {
  const badge = primaryBadge(tour.badges);

  return (
    <article className="group relative flex h-full flex-col">
      <div className="relative overflow-hidden">
        <div className="aspect-4/5 w-full transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]">
          <TourVisual slug={tour.slug} title={tour.title} image={tour.image} />
        </div>

        {/* Одна отметка вместо россыпи бейджей — иначе фото превращается в доску объявлений */}
        {badge ? (
          <span className="bg-bg/90 text-ink absolute right-0 bottom-0 px-4 py-2.5 text-[0.625rem] font-medium tracking-[0.18em] uppercase">
            {badge.label}
          </span>
        ) : null}

        <div className="absolute top-0 right-0">
          <FavoriteButton tourId={tour.id} />
        </div>
      </div>

      <div className="mt-6 flex flex-1 flex-col">
        {tour.subtitle ? <p className="kicker-plain text-faint mb-3">{tour.subtitle}</p> : null}

        <h3 className="font-display text-ink text-[1.5rem] leading-[1.15]">
          <Link href={`/excursions/${tour.slug}`} className="link-underline after:absolute after:inset-0">
            {tour.title}
          </Link>
        </h3>

        <dl className="text-muted border-line mt-5 space-y-1.5 border-t pt-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="sr-only">Стоимость</dt>
            <dd className="text-ink">{priceLabel(tour.price, tour.priceType)}</dd>
            <dt className="sr-only">Длительность</dt>
            <dd>{formatDuration(tour.durationMinutes)}</dd>
          </div>
          <div>
            <dt className="sr-only">Размер группы</dt>
            <dd>{groupLabel(tour.groupMin, tour.groupMax)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
