import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Reveal } from '@/components/motion/reveal';
import { BookingForm } from '@/components/tours/booking-form';
import { FavoriteButton } from '@/components/tours/favorite-button';
import { ProgramTimeline } from '@/components/tours/program-timeline';
import { RouteMap } from '@/components/tours/route-map';
import { TourVisual } from '@/components/tours/tour-visual';
import { Container } from '@/components/ui/container';
import { CarIcon, CheckIcon, ClockIcon, MapPinIcon, RubleIcon, WalkIcon, XIcon } from '@/components/ui/icons';
import { site } from '@/config/site';
import { ApiRequestError } from '@/lib/api';
import { getTour, getTourReviews, safe } from '@/lib/data';
import { formatDate, formatDuration, groupLabel, primaryBadge, priceLabel } from '@/lib/format';
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

/** Заголовок раздела внутри страницы — единый размер и отступ. */
function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="display mb-8 text-[clamp(1.5rem,2.4vw,2.125rem)]">
      {children}
    </h2>
  );
}

export default async function TourPage({ params }: { params: Params }) {
  const { slug } = await params;
  const tour = await loadTour(slug);
  const reviews = await safe(getTourReviews(slug), { items: [], total: 0, page: 1, limit: 12, pages: 1 });

  const byCar = tour.badges.some((b) => b.slug === 'by-car');
  const MovementIcon = byCar ? CarIcon : WalkIcon;
  const movement = byCar ? 'Индивидуальная автомобильно-пешеходная' : 'Индивидуальная пешеходная';
  const badge = primaryBadge(tour.badges);

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

  /* Три плитки под описанием — приём референса: формат, цена, время */
  const facts = [
    { Icon: MovementIcon, label: 'Формат', value: movement },
    {
      Icon: RubleIcon,
      label: 'Стоимость',
      value: priceLabel(tour.price, tour.priceType) + ', ' + groupLabel(tour.groupMin, tour.groupMax),
    },
    { Icon: ClockIcon, label: 'Время', value: formatDuration(tour.durationMinutes) },
  ];

  return (
    <div className="pt-32 md:pt-40">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container className="!max-w-[104rem]">
        <nav aria-label="Хлебные крошки" className="kicker-plain text-faint mb-12">
          <Link href="/excursions" className="link-underline hover:text-ink">
            Экскурсии
          </Link>
          <span className="mx-3" aria-hidden>
            /
          </span>
          <span className="text-muted">{tour.title}</span>
        </nav>

        {/* Первый экран: фото слева, рассказ справа */}
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <div className="relative">
              <div className="aspect-4/5 overflow-hidden">
                <TourVisual
                  slug={tour.slug}
                  title={tour.title}
                  image={tour.images[0] ?? null}
                  variant="hero"
                  priority
                />
              </div>
              {badge ? (
                <span className="bg-bg/90 text-ink absolute right-0 bottom-0 px-5 py-3 text-[0.625rem] font-medium tracking-[0.18em] uppercase">
                  {badge.label}
                </span>
              ) : null}
              <div className="absolute top-0 right-0">
                <FavoriteButton tourId={tour.id} />
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div>
              {tour.subtitle ? <p className="kicker-plain text-faint mb-5">{tour.subtitle}</p> : null}
              <h1 className="display text-[clamp(2rem,4vw,3.5rem)]">{tour.title}</h1>

              <div className="mt-9 space-y-5">
                {tour.fullDescription
                  .split('\n')
                  .filter(Boolean)
                  .map((paragraph, i) => (
                    <p key={i} className="text-muted text-[1.0625rem] leading-[1.8]">
                      {paragraph}
                    </p>
                  ))}
              </div>

              <dl className="border-line mt-12 grid gap-8 border-t pt-10 sm:grid-cols-3">
                {facts.map(({ Icon, label, value }) => (
                  <div key={label}>
                    <span className="icon-tile mb-5">
                      <Icon className="h-5 w-5" />
                    </span>
                    <dt className="kicker-plain text-faint mb-2">{label}</dt>
                    <dd className="text-ink text-sm leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>

              <Link
                href="#booking"
                className="bg-ink text-bg hover:bg-ink-soft mt-12 inline-flex cursor-pointer items-center px-10 py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              >
                Забронировать
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="mt-28 grid gap-16 md:mt-40 lg:grid-cols-[1fr_23rem] lg:items-start lg:gap-20">
          <div className="min-w-0 space-y-24">
            {tour.program.length > 0 ? (
              <section aria-labelledby="program">
                <SectionTitle id="program">Программа</SectionTitle>
                <ProgramTimeline steps={tour.program} />
              </section>
            ) : null}

            {tour.routePoints.length > 0 ? (
              <section aria-labelledby="route">
                <SectionTitle id="route">Маршрут</SectionTitle>
                <RouteMap points={tour.routePoints} />
                <ol className="border-line mt-10 grid gap-x-10 border-t sm:grid-cols-2">
                  {tour.routePoints.map((point, i) => (
                    <li key={point.title + i} className="border-line flex items-start gap-5 border-b py-5">
                      <span className="text-faint w-6 shrink-0 text-xs tabular-nums">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-ink text-sm">{point.title}</p>
                        {point.description ? (
                          <p className="text-muted mt-1 text-xs leading-relaxed">{point.description}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section aria-labelledby="included" className="grid gap-12 sm:grid-cols-2">
              <div>
                <h2 id="included" className="kicker mb-6">
                  Что входит
                </h2>
                <ul className="space-y-3">
                  {tour.included.map((item) => (
                    <li key={item} className="text-muted flex items-start gap-3 text-sm leading-relaxed">
                      <CheckIcon className="text-ink mt-0.5 h-4 w-4 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="kicker mb-6">Что не входит</h3>
                <ul className="space-y-3">
                  {tour.notIncluded.map((item) => (
                    <li key={item} className="text-muted flex items-start gap-3 text-sm leading-relaxed">
                      <XIcon className="text-faint mt-0.5 h-4 w-4 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {tour.recommendations ? (
              <section aria-labelledby="tips" className="border-line border-t pt-10">
                <h2 id="tips" className="kicker mb-5">
                  Рекомендации
                </h2>
                <p className="text-muted max-w-[62ch] text-sm leading-[1.8]">{tour.recommendations}</p>
              </section>
            ) : null}

            {tour.meetingPoint ? (
              <section aria-labelledby="meeting" className="border-line border-t pt-10">
                <h2 id="meeting" className="kicker mb-5">
                  Место встречи
                </h2>
                <p className="text-ink flex items-start gap-3 text-sm">
                  <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {tour.meetingPoint}
                </p>
                {tour.meetingLat && tour.meetingLng ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${tour.meetingLat}&mlon=${tour.meetingLng}#map=17/${tour.meetingLat}/${tour.meetingLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline text-muted mt-3 ml-7 inline-block text-sm"
                  >
                    Открыть на карте
                  </a>
                ) : null}
              </section>
            ) : null}

            {reviews.items.length > 0 ? (
              <section aria-labelledby="reviews">
                <SectionTitle id="reviews">Отзывы</SectionTitle>
                <ul className="border-line border-t">
                  {reviews.items.map((review) => (
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
              </section>
            ) : null}
          </div>

          <aside id="booking" className="scroll-mt-32 lg:sticky lg:top-28" aria-label="Бронирование">
            <div className="border-line border p-8">
              <p className="kicker-plain text-faint">Стоимость</p>
              <p className="font-display text-ink mt-3 mb-8 text-[2rem] leading-none">
                {priceLabel(tour.price, tour.priceType)}
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
