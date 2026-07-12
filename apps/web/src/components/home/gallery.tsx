import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';

/**
 * Фотогалерея главной. Пока фотографии не загружены через админку (этап 5),
 * место держат тёплые графические тайлы с подписями городских локаций.
 */
const tiles = [
  { title: 'Староволжский мост', hue: '#c0703e', tall: true },
  { title: 'Набережная Степана Разина', hue: '#c6a87e' },
  { title: 'Путевой дворец', hue: '#a1815d' },
  { title: 'Трёхсвятская улица', hue: '#dbc7a6', tall: true },
  { title: 'Белая Троица', hue: '#8a6d4f' },
  { title: 'Берега Орши', hue: '#b98a5a' },
];

export function Gallery() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <SectionHeading
          eyebrow="Фотогалерея"
          title="Тверь, какой мы её видим"
          subtitle="Мосты и набережные, дворцовая классика и деревянные наличники предместий."
        />
        <div className="grid auto-rows-[9rem] grid-cols-2 gap-4 md:auto-rows-[11rem] md:grid-cols-3">
          {tiles.map((tile, i) => (
            <Reveal key={tile.title} delay={i * 0.05} className={tile.tall ? 'row-span-2' : ''}>
              <figure className="group shadow-card relative h-full w-full overflow-hidden rounded-3xl">
                <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
                  <defs>
                    <radialGradient id={`tile-${i}`} cx="30%" cy="25%" r="90%">
                      <stop offset="0%" stopColor="#fbf9f4" stopOpacity="0.85" />
                      <stop offset="100%" stopColor={tile.hue} />
                    </radialGradient>
                  </defs>
                  <rect width="100" height="100" fill={`url(#tile-${i})`} />
                  <path
                    d="M0 84 L16 84 L22 72 L30 84 L46 84 L54 66 L62 84 L78 84 L86 74 L94 84 L100 84 L100 100 L0 100 Z"
                    fill="#2a2014"
                    opacity="0.18"
                  />
                </svg>
                <figcaption className="absolute right-3 bottom-3 left-3">
                  <span className="glass text-bark-800 inline-block rounded-full px-3 py-1.5 text-xs font-semibold">
                    {tile.title}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
