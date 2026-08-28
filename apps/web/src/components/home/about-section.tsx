'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';
import { Container } from '@/components/ui/container';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const defaultIntro =
  'К изучению истории родного города я пришла после исследования истории своего рода. ' +
  'Рассказы старших родственников, работа с первоисточниками в архивах, поездки по сёлам ' +
  'и деревням Тверского края. Каково же было моё удивление, что более 11 поколений предков ' +
  'проживали на территории Тверской губернии!\n' +
  'После такого открытия было невозможно не углубиться в историю Твери. Теперь я ' +
  'аттестованный экскурсовод и с радостью делюсь знаниями о своём городе с туристами ' +
  'и всеми, кому интересно настоящее и прошлое Твери.';

/**
 * Блок «Обо мне». Состав задан правками заказчицы: фото, имя, её текст
 * и подпись-регалия. Без цифры «130+», без кнопки и без трёх «ценностей»
 * из исходного шаблона — всё это она вычеркнула.
 */
export function AboutSection({ intro }: { intro?: string }) {
  const root = useRef<HTMLElement>(null);
  const paragraphs = (intro || defaultIntro).split('\n').filter(Boolean);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsap
        .timeline({
          scrollTrigger: { trigger: root.current, start: 'top 72%', once: true },
          defaults: { ease: 'power3.out' },
        })
        .fromTo(
          '.about-photo',
          { clipPath: 'inset(0% 0% 100% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.out' },
        )
        .fromTo('.about-photo img', { scale: 1.16 }, { scale: 1, duration: 1.6, ease: 'expo.out' }, 0)
        .fromTo('.about-reveal', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.13 }, 0.3)
        .fromTo('.about-tag', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, 0.9);

      // Медленный дрейф фото при прокрутке — глубина без параллакса на тексте.
      gsap.to('.about-photo img', {
        yPercent: 6,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="py-28 md:py-40" aria-labelledby="about-me">
      <Container className="!max-w-[104rem]">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
          {/* Фото с подписью-регалией, лежащей поверх нижнего края */}
          <div className="relative">
            <div className="about-photo relative aspect-4/5 overflow-hidden">
              <img
                src="/photos/elena.jpg"
                alt="Елена Громова, аттестованный экскурсовод по Твери"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="about-tag bg-bg text-ink shadow-float absolute right-0 -bottom-6 px-8 py-6 text-[0.6875rem] font-medium tracking-[0.18em] uppercase sm:right-[-1.5rem]">
              аттестованный экскурсовод
            </p>
          </div>

          <div className="lg:pl-6">
            <p className="about-reveal kicker mb-6">Обо мне</p>
            <h2 id="about-me" className="about-reveal display text-[clamp(2rem,3.8vw,3.25rem)]">
              Елена Громова
            </h2>
            <div className="mt-9 space-y-6">
              {paragraphs.map((text) => (
                <p key={text.slice(0, 24)} className="about-reveal text-muted text-[1.0625rem] leading-[1.8]">
                  {text}
                </p>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
