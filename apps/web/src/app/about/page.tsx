import type { Metadata } from 'next';
import { ContactCta } from '@/components/home/contact-cta';
import { ReviewsSection } from '@/components/home/reviews-section';
import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import { getLatestReviews, getSettings, safe } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Об экскурсоводе',
  description:
    'Елена Громова — аттестованный экскурсовод по Твери. Более 11 поколений предков жили в Тверской губернии; отсюда и авторские маршруты по городу и окрестностям.',
};

const defaultIntro =
  'К изучению истории родного города я пришла после исследования истории своего рода. ' +
  'Рассказы старших родственников, работа с первоисточниками в архивах, поездки по сёлам ' +
  'и деревням Тверского края. Каково же было моё удивление, что более 11 поколений предков ' +
  'проживали на территории Тверской губернии!\n' +
  'После такого открытия было невозможно не углубиться в историю Твери. Теперь я ' +
  'аттестованный экскурсовод и с радостью делюсь знаниями о своём городе с туристами ' +
  'и всеми, кому интересно настоящее и прошлое Твери.';

export default async function AboutPage() {
  const [settings, reviews] = await Promise.all([getSettings(), safe(getLatestReviews(), [])]);
  const paragraphs = (settings['about.intro'] || defaultIntro).split('\n').filter(Boolean);

  return (
    <>
      <section className="pt-40 pb-28 md:pt-52 md:pb-40">
        <Container className="!max-w-[104rem]">
          <Reveal>
            <p className="kicker mb-7">Об экскурсоводе</p>
            <h1 className="display text-[clamp(2.5rem,6vw,5rem)]">Елена Громова</h1>
          </Reveal>

          <div className="mt-16 grid gap-14 lg:mt-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
            <Reveal>
              <div className="relative">
                {/* Главная картинка страницы: без lazy и с высоким приоритетом —
                    именно она определяет момент «страница загрузилась». */}
                <div className="aspect-4/5 overflow-hidden">
                  <img
                    src="/photos/elena.webp"
                    srcSet="/photos/elena-600.webp 600w, /photos/elena.webp 900w"
                    sizes="(min-width: 1024px) 40vw, 92vw"
                    alt="Елена Громова на набережной Волги"
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="bg-bg text-ink shadow-float absolute right-0 -bottom-6 px-8 py-6 text-[0.6875rem] font-medium tracking-[0.18em] uppercase sm:right-[-1.5rem]">
                  аттестованный экскурсовод
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="space-y-6 lg:pt-4">
                {paragraphs.map((text) => (
                  <p key={text.slice(0, 24)} className="text-muted text-[1.0625rem] leading-[1.8]">
                    {text}
                  </p>
                ))}
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      <ReviewsSection reviews={reviews} />
      <ContactCta settings={settings} />
    </>
  );
}
