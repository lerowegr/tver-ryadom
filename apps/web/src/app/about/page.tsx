import type { Metadata } from 'next';
import { Advantages } from '@/components/home/advantages';
import { ContactCta } from '@/components/home/contact-cta';
import { ReviewsSection } from '@/components/home/reviews-section';
import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { getLatestReviews, getSettings, safe } from '@/lib/data';

export const metadata: Metadata = {
  title: 'О компании',
  description:
    'Кто мы и почему показываем Тверь по-своему: история проекта «Тверь рядом», команда гидов и наши принципы.',
};

const team = [
  {
    name: 'Егор',
    role: 'Основатель и гид',
    text: 'Придумал «Тверь рядом», чтобы показывать город без пафоса и скуки. Ведёт обзорную и авторские маршруты.',
  },
  {
    name: 'Анна',
    role: 'Гид-краевед',
    text: 'Знает про Затьмачье больше, чем архивы. Отвечает за маршруты по предместьям и работу с семьями.',
  },
  {
    name: 'Михаил',
    role: 'Гид-водитель',
    text: 'Возит гостей в Савватьево и окрестности. Спокойный руль, горячий чай и истории по дороге.',
  },
];

export default async function AboutPage() {
  const [settings, reviews] = await Promise.all([getSettings(), safe(getLatestReviews(), [])]);

  return (
    <>
      <div className="pt-28 md:pt-36">
        <Container>
          <Reveal className="max-w-3xl">
            <p className="text-terra-600 mb-3 text-sm font-semibold tracking-widest uppercase">О компании</p>
            <h1 className="font-display text-ink-900 text-4xl leading-tight font-semibold text-balance md:text-5xl">
              Мы показываем Тверь так, как показывали бы её друзьям
            </h1>
            <p className="text-bark-700 mt-6 text-lg leading-relaxed">
              «Тверь рядом» началась с простой мысли: город между двумя столицами заслуживает
              большего, чем транзитная остановка. Мы собираем маршруты из личных находок, разговоров
              со старожилами и архивных историй — и рассказываем их живым языком.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {[
              ['2023', 'год, когда мы провели первую прогулку'],
              ['3', 'авторских маршрута — и новые в работе'],
              ['500+', 'гостей уже увидели Тверь с нами'],
            ].map(([num, label], i) => (
              <Reveal key={label} delay={i * 0.08}>
                <div className="glass shadow-card rounded-3xl p-7 text-center">
                  <p className="font-display text-terra-600 text-4xl font-semibold">{num}</p>
                  <p className="text-bark-700 mt-2 text-sm">{label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </div>

      <section className="pt-20 md:pt-28" aria-labelledby="team">
        <Container>
          <SectionHeading
            eyebrow="Команда"
            title="Люди, которые ведут вас по городу"
            subtitle="Небольшая команда, влюблённая в Тверь. Каждый маршрут — чей-то личный любимый."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {team.map((member, i) => (
              <Reveal key={member.name} delay={i * 0.08}>
                <article className="shadow-card h-full rounded-3xl bg-white p-8 text-center">
                  <span
                    className="from-sand-300 to-terra-500 font-display mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-semibold text-white"
                    aria-hidden
                  >
                    {member.name[0]}
                  </span>
                  <h3 className="text-ink-900 text-lg font-bold">{member.name}</h3>
                  <p className="text-terra-600 mb-3 text-sm font-semibold">{member.role}</p>
                  <p className="text-bark-700 text-sm leading-relaxed">{member.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <Advantages />
      <ReviewsSection reviews={reviews} />

      <section className="py-4 pb-20" aria-labelledby="license">
        <Container>
          <Reveal>
            <p className="text-bark-600 mx-auto max-w-2xl text-center text-sm leading-relaxed">
              Работаем официально как самозанятые гиды. Сведения об аттестации экскурсоводов
              появятся в этом разделе после прохождения процедуры.
            </p>
          </Reveal>
        </Container>
      </section>

      <ContactCta settings={settings} />
    </>
  );
}
