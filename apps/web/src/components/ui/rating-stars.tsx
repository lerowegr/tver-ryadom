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
            className={`h-4 w-4 ${i <= Math.round(rating) ? 'text-ink' : 'text-line-strong'}`}
          />
        ))}
      </span>
      <span className="text-ink text-sm">{rating.toFixed(1).replace('.', ',')}</span>
      {count !== undefined ? (
        <span className="text-muted text-sm" aria-label={`${count} отзывов`}>
          ({count})
        </span>
      ) : null}
    </span>
  );
}
