import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Reveal } from '@/components/motion/reveal';
import { BookingForm } from '@/components/tours/booking-form';
import { ProgramTimeline } from '@/components/tours/program-timeline';
import { RouteMap } from '@/components/tours/route-map';
import { TourVisual } from '@/components/tours/tour-visual';
import { TourBadge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { CheckIcon, ClockIcon, MapPinIcon, UsersIcon, XIcon } from '@/components/ui/icons';
import { RatingStars } from '@/components/ui/rating-stars';
import { site } from '@/config/site';
import { ApiRequestError } from '@/lib/api';
import { getTour, getTourReviews, safe } from '@/lib/data';
import { formatDate, formatDuration, groupLabel, priceLabel } from '@/lib/format';
import type { TourDetailDto } from '@/lib/types';

type Params = Promise<{ slug: string }>;

async function loadTour(slug: string): Promise<TourDetailDto> {
  try {
    return await getTour(slug);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'not_found') notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const tour = await getTour(slug);
    return {
      title: tour.title,
      description: tour.shortDescription,
      openGraph: { title: tour.title, description: tour.shortDescription },
    };
  } catch {
    return { title: 'Экскурсия' };
  }
}

export default async function TourPage({ params }: { params: Params }) {
  const { slug } = await params;
  const tour = await loadTour(slug);
  const reviews = await safe(getTourReviews(slug), { items: [], total: 0, page: 1, limit: 12, pages: 1 });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: tour.title,
    description: tour.shortDescription,
    touristType: tour.badges.map((b) => b.label),
    itinerary: tour.routePoints.map((point) => ({ '@type': 'TouristAttraction', name: point.title })),
    offers: {
      '@type': 'Offer',
      price: tour.price / 100,
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
    },
    provider: { '@type': 'LocalBusiness', name: site.name, url: site.url },
    ...(tour.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: tour.ratingAvg,
            reviewCount: tour.ratingCount,
          },
        }
      : {}),
  };

  return (
    <div className="pt-24 md:pt-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container>
        <nav aria-label="Хлебные крошки" className="text-bark-600 mb-6 text-sm">
          <Link href="/excursions" className="hover:text-terra-600">
            Экскурсии
          </Link>
          <span className="mx-2" aria-hidden>
            /
          </span>
          <span className="text-ink-900">{tour.title}</span>
        </nav>

        <header className="mb-8 max-w-3xl">
          <div className="mb-4 flex flex-wrap gap-2">
            {tour.badges.map((badge) => (
              <TourBadge key={badge.slug} {...badge} />
            ))}
          </div>
          <h1 className="font-display text-ink-900 text-4xl leading-tight font-semibold text-balance md:text-5xl">
            {tour.title}
          </h1>
          {tour.subtitle ? <p className="text-bark-700 mt-3 text-xl">{tour.subtitle}</p> : null}
          <div className="text-bark-700 mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
            <RatingStars rating={tour.ratingAvg} count={tour.ratingCount} />
            <span className="flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4" /> {formatDuration(tour.durationMinutes)}
            </span>
            <span className="flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4" /> {groupLabel(tour.groupMin, tour.groupMax)}
            </span>
          </div>
        </header>

        <div className="shadow-soft mb-12 h-72 overflow-hidden rounded-[2rem] md:h-96">
          <TourVisual slug={tour.slug} title={tour.title} image={tour.images[0] ?? null} variant="hero" />
        </div>

        <div className="grid gap-12 lg:grid-cols-[1fr_24rem] lg:items-start">
          <div className="min-w-0 space-y-14">
            <Reveal>
              <section aria-labelledby="about-tour">
                <h2 id="about-tour" className="font-display text-ink-900 heading-accent mb-6 text-2xl font-semibold md:text-3xl">
                  Об экскурсии
                </h2>
                <div className="prose-tver max-w-none">
                  {tour.fullDescription.split('\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </section>
            </Reveal>

            {tour.program.length > 0 ? (
              <section aria-labelledby="program">
                <h2 id="program" className="font-display text-ink-900 heading-accent mb-8 text-2xl font-semibold md:text-3xl">
                  Программа
                </h2>
                <ProgramTimeline steps={tour.program} />
              </section>
            ) : null}

            {tour.routePoints.length > 0 ? (
              <section aria-labelledby="route">
                <h2 id="route" className="font-display text-ink-900 heading-accent mb-8 text-2xl font-semibold md:text-3xl">
                  Маршрут
                </h2>
                <RouteMap points={tour.routePoints} />
                <ol className="grid gap-3 sm:grid-cols-2">
                  {tour.routePoints.map((point, i) => (
                    <li key={`${point.title}-${i}`} className="flex items-start gap-3 rounded-2xl bg-white p-4">
                      <span className="bg-cream-200 text-bark-800 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-ink-900 text-sm font-semibold">{point.title}</p>
                        {point.description ? (
                          <p className="text-bark-600 mt-0.5 text-xs">{point.description}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <Reveal>
              <section aria-labelledby="included" className="grid gap-5 sm:grid-cols-2">
                <div className="shadow-card rounded-3xl bg-white p-7">
                  <h2 id="included" className="text-ink-900 mb-4 font-bold">
                    Что входит
                  </h2>
                  <ul className="space-y-2.5">
                    {tour.included.map((item) => (
                      <li key={item} className="text-bark-700 flex items-start gap-2.5 text-sm">
                        <CheckIcon className="text-terra-500 mt-0.5 h-4 w-4 shrink-0" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="shadow-card rounded-3xl bg-white p-7">
                  <h3 className="text-ink-900 mb-4 font-bold">Что не входит</h3>
                  <ul className="space-y-2.5">
                    {tour.notIncluded.map((item) => (
                      <li key={item} className="text-bark-700 flex items-start gap-2.5 text-sm">
                        <XIcon className="text-sand-400 mt-0.5 h-4 w-4 shrink-0" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </Reveal>

            {tour.recommendations ? (
              <Reveal>
                <section aria-labelledby="tips" className="glass rounded-3xl p-7">
                  <h2 id="tips" className="text-ink-900 mb-3 font-bold">
                    Рекомендации
                  </h2>
                  <p className="text-bark-700 text-sm leading-relaxed">{tour.recommendations}</p>
                </section>
              </Reveal>
            ) : null}

            {tour.meetingPoint ? (
              <Reveal>
                <section aria-labelledby="meeting" className="flex items-start gap-4">
                  <span className="bg-terra-500/10 text-terra-600 rounded-2xl p-3">
                    <MapPinIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <h2 id="meeting" className="text-ink-900 font-bold">
                      Место встречи
                    </h2>
                    <p className="text-bark-700 mt-1 text-sm">{tour.meetingPoint}</p>
                    {tour.meetingLat && tour.meetingLng ? (
                      <a
                        href={`https://yandex.ru/maps/?pt=${tour.meetingLng},${tour.meetingLat}&z=16`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-terra-600 mt-1 inline-block text-sm font-medium hover:underline"
                      >
                        Открыть в Яндекс.Картах →
                      </a>
                    ) : null}
                  </div>
                </section>
              </Reveal>
            ) : null}

            {reviews.items.length > 0 ? (
              <section aria-labelledby="reviews">
                <h2 id="reviews" className="font-display text-ink-900 heading-accent mb-8 text-2xl font-semibold md:text-3xl">
                  Отзывы
                </h2>
                <ul className="space-y-5">
                  {reviews.items.map((review) => (
                    <li key={review.id} className="shadow-card rounded-3xl bg-white p-7">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-ink-900 font-semibold">{review.authorName}</p>
                        <RatingStars rating={review.rating} />
                      </div>
                      <p className="text-bark-700 mt-3 text-sm leading-relaxed">{review.text}</p>
                      <p className="text-bark-500 mt-3 text-xs">{formatDate(review.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24" aria-label="Бронирование">
            <div className="glass shadow-soft rounded-[2rem] p-7">
              <p className="text-bark-600 text-sm">Стоимость</p>
              <p className="text-ink-900 font-display mt-1 mb-6 text-3xl font-semibold">
                от {priceLabel(tour.price, tour.priceType)}
              </p>
              <BookingForm
                tour={{
                  id: tour.id,
                  title: tour.title,
                  price: tour.price,
                  priceType: tour.priceType,
                  groupMin: tour.groupMin,
                  groupMax: tour.groupMax,
                  schedules: tour.schedules,
                }}
              />
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
