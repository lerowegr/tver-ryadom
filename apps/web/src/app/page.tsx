import Link from 'next/link';
import { Advantages } from '@/components/home/advantages';
import { ContactCta } from '@/components/home/contact-cta';
import { Gallery } from '@/components/home/gallery';
import { Hero } from '@/components/home/hero';
import { ReviewsSection } from '@/components/home/reviews-section';
import { Reveal } from '@/components/motion/reveal';
import { TourCard } from '@/components/tours/tour-card';
import { Container } from '@/components/ui/container';
import { ArrowRightIcon } from '@/components/ui/icons';
import { SectionHeading } from '@/components/ui/section-heading';
import { site } from '@/config/site';
import { getLatestReviews, getSettings, getTours, safe } from '@/lib/data';

export default async function HomePage() {
  const [settings, toursPage, reviews] = await Promise.all([
    getSettings(),
    safe(getTours(), { items: [], total: 0, page: 1, limit: 12, pages: 1 }),
    safe(getLatestReviews(), []),
  ]);

  const tours = toursPage.items.slice(0, 3);
  const rating =
    tours.length > 0
      ? tours.reduce((sum, tour) => sum + (tour.ratingAvg || 5), 0) / tours.length
      : 5;

  return (
    <>
      <Hero
        tagline={settings['company.tagline'] ?? site.tagline}
        subtitle={
          settings['home.subtitle'] ||
          'Гуляем по набережным Волги, заглядываем в тихое Затьмачье и уезжаем к монастырским берегам Орши. Небольшие группы, живые истории и город, который становится ближе.'
        }
        stats={{ tours: toursPage.total, rating }}
      />

      {tours.length > 0 ? (
        <section className="py-20 md:py-28" aria-labelledby="popular">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionHeading
                eyebrow="Экскурсии"
                title="Популярные маршруты"
                subtitle="С чего начать знакомство с Тверью — выбор наших гостей."
              />
              <Reveal className="mb-10 md:mb-14">
                <Link
                  href="/excursions"
                  className="text-terra-600 hover:text-terra-700 inline-flex items-center gap-2 font-semibold"
                >
                  Все экскурсии <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </Reveal>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {tours.map((tour, i) => (
                <Reveal key={tour.id} delay={i * 0.1} className="h-full">
                  <TourCard tour={tour} />
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <Advantages />
      <ReviewsSection reviews={reviews} />
      <Gallery />
      <ContactCta settings={settings} />
    </>
  );
}
