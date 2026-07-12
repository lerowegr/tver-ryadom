import { StarIcon } from '@/components/ui/icons';

export function RatingStars({
  rating,
  count,
  className = '',
}: {
  rating: number;
  count?: number;
  className?: string;
}) {
  if (!rating) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon
            key={i}
            className={`h-4 w-4 ${i <= Math.round(rating) ? 'text-terra-500' : 'text-sand-300'}`}
          />
        ))}
      </span>
      <span className="text-ink-900 text-sm font-semibold">{rating.toFixed(1).replace('.', ',')}</span>
      {count !== undefined ? (
        <span className="text-bark-600 text-sm" aria-label={`${count} отзывов`}>
          ({count})
        </span>
      ) : null}
    </span>
  );
}
