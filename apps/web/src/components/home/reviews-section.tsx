import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { RatingStars } from '@/components/ui/rating-stars';
import { SectionHeading } from '@/components/ui/section-heading';
import type { LatestReviewDto } from '@/lib/types';

export function ReviewsSection({ reviews }: { reviews: LatestReviewDto[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="bg-cream-100 py-20 md:py-28">
      <Container>
        <SectionHeading
          eyebrow="Отзывы"
          title="Что говорят наши гости"
          subtitle="Настоящие впечатления людей, которые уже прогулялись с нами по Твери."
        />
      </Container>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:px-6 lg:px-[max(2rem,calc((100vw-72rem)/2))]">
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
