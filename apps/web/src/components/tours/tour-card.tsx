import Link from 'next/link';
import { TourBadge } from '@/components/ui/badge';
import { ClockIcon, MapPinIcon, UsersIcon } from '@/components/ui/icons';
import { RatingStars } from '@/components/ui/rating-stars';
import { TourVisual } from '@/components/tours/tour-visual';
import { formatDuration, groupLabel, priceLabel } from '@/lib/format';
import type { TourCardDto } from '@/lib/types';

export function TourCard({ tour }: { tour: TourCardDto }) {
  return (
    <article className="group shadow-card hover:shadow-soft relative flex h-full flex-col overflow-hidden rounded-3xl bg-white transition-all duration-300 hover:-translate-y-1">
      <div className="relative h-52 overflow-hidden">
        <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]">
          <TourVisual slug={tour.slug} title={tour.title} image={tour.image} />
        </div>
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          {tour.badges.slice(0, 3).map((badge) => (
            <TourBadge key={badge.slug} {...badge} />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-ink-900 text-xl leading-snug font-semibold">
            <Link href={`/excursions/${tour.slug}`} className="after:absolute after:inset-0">
              {tour.title}
            </Link>
          </h3>
        </div>
        <RatingStars rating={tour.ratingAvg} count={tour.ratingCount} className="mt-2" />
        <p className="text-bark-700 mt-3 line-clamp-3 text-sm leading-relaxed">{tour.shortDescription}</p>

        {tour.routePoints.length > 0 ? (
          <p className="text-bark-600 mt-3 flex items-start gap-1.5 text-xs leading-relaxed">
            <MapPinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{tour.routePoints.slice(0, 4).join(' · ')}</span>
          </p>
        ) : null}

        <div className="border-cream-200 mt-auto flex items-center justify-between border-t pt-4">
          <div className="text-bark-700 mt-4 flex gap-4 text-xs font-medium">
            <span className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" /> {formatDuration(tour.durationMinutes)}
            </span>
            <span className="flex items-center gap-1">
              <UsersIcon className="h-4 w-4" /> {groupLabel(tour.groupMin, tour.groupMax)}
            </span>
          </div>
          <p className="text-ink-900 mt-4 text-sm font-bold whitespace-nowrap">
            от {priceLabel(tour.price, tour.priceType)}
          </p>
        </div>
      </div>
    </article>
  );
}
