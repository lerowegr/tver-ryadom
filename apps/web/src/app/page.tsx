import { AboutSection } from '@/components/home/about-section';
import { ContactCta } from '@/components/home/contact-cta';
import { PhotoBand } from '@/components/home/photo-band';
import { Hero } from '@/components/home/hero';
import { ReviewsSection } from '@/components/home/reviews-section';
import { Reveal } from '@/components/motion/reveal';
import { TourCard } from '@/components/tours/tour-card';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { getLatestReviews, getSettings, getTours, safe } from '@/lib/data';

const heroLead =
  'Три маршрута: обзорная прогулка по историческому центру, поездка в Савватьево ' +
  'и неочевидное «Предместье Твери». Судьбы людей, тайны улиц и истории кладов — ' +
  'без сухого перечисления дат.';

export default async function HomePage() {
  const [settings, toursPage, reviews] = await Promise.all([
    getSettings(),
    safe(getTours(), { items: [], total: 0, page: 1, limit: 12, pages: 1 }),
    safe(getLatestReviews(), []),
  ]);

  const tours = toursPage.items.slice(0, 3);

  return (
    <>
      <Hero
        kicker="Елена Громова — экскурсовод по Твери"
        titleTop="Авторские экскурсии по Твери"
        titleItalic="через живые истории"
        lead={settings['home.lead'] || heroLead}
        imageUrl={tours[0]?.image?.variants?.hero ?? tours[0]?.image?.variants?.card ?? null}
      />
      {tours.length > 0 ? (
        <section className="py-28 md:py-40" aria-labelledby="popular">
          <Container className="!max-w-[104rem]">
            <SectionHeading
              eyebrow="3 авторских маршрута"
              title="Экскурсии по Твери и окрестностям"
            />
            <div className="mt-16 grid gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-3 lg:mt-24">
              {tours.map((tour, i) => (
                <Reveal key={tour.id} delay={i * 0.12} className="h-full">
                  <TourCard tour={tour} />
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <AboutSection intro={settings['about.intro']} />
      <ReviewsSection reviews={reviews} />
      <PhotoBand />
      <ContactCta settings={settings} />
    </>
  );
}
