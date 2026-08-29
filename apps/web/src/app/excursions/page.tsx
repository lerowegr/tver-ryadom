import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Reveal } from '@/components/motion/reveal';
import { TourCard } from '@/components/tours/tour-card';
import { TourFilters } from '@/components/tours/filters';
import { Pagination } from '@/components/tours/pagination';
import { Container } from '@/components/ui/container';
import { getBadges, getTours, safe } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Экскурсии по Твери — каталог маршрутов',
  description:
    'Каталог авторских экскурсий по Твери: обзорные прогулки, поездки в Савватьево, маршруты по предместьям. Цены, расписание, онлайн-бронирование.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export default async function ExcursionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = {
    page: str(params.page),
    badge: str(params.badge),
    sort: str(params.sort),
    durationMax: str(params.durationMax),
    search: str(params.search),
  };

  const [badges, toursPage] = await Promise.all([
    safe(getBadges(), []),
    safe(getTours(query), { items: [], total: 0, page: 1, limit: 12, pages: 1 }),
  ]);

  return (
    <div className="pt-40 pb-24 md:pt-52">
      <Container className="!max-w-[104rem]">
        <Reveal className="mb-16 max-w-2xl">
          <p className="kicker mb-7">Каталог</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.25rem)]">Экскурсии по Твери</h1>
          <p className="text-muted mt-7 text-[1.0625rem] leading-[1.75]">
            {toursPage.total > 0
              ? `${toursPage.total} маршрута — от классической обзорной до тихих предместий.`
              : 'Маршруты скоро появятся.'}
          </p>
        </Reveal>

        <Suspense>
          <TourFilters badges={badges} />
        </Suspense>

        {toursPage.items.length > 0 ? (
          <div className="mt-16 grid gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
            {toursPage.items.map((tour, i) => (
              <Reveal key={tour.id} delay={(i % 3) * 0.08} className="h-full">
                <TourCard tour={tour} priority={i === 0} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="border-line mt-16 border-t py-24 text-center">
            <p className="font-display text-ink text-2xl">По выбранным фильтрам ничего не нашлось</p>
            <p className="text-muted mt-4 text-sm">Попробуйте сбросить фильтры или заглянуть позже.</p>
          </div>
        )}

        <Pagination page={toursPage.page} pages={toursPage.pages} basePath="/excursions" query={query} />
      </Container>
    </div>
  );
}
