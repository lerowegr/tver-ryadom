'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Link from 'next/link';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export interface HeroProps {
  kicker: string;
  titleTop: string;
  titleItalic: string;
  lead: string;
  imageUrl?: string | null;
  imageCaption?: string;
}

/** Строка заголовка в маске: внутренний span выезжает снизу. */
function MaskedLine({ children, italic = false }: { children: string; italic?: boolean }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <span className={`hero-line block ${italic ? 'italic' : ''}`}>{children}</span>
    </span>
  );
}

/** Заглушка вместо фотографии: слоистые плоскости с мягким дрейфом. */
function PhotoPlate() {
  return (
    <div className="bg-surface-soft absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 90% at 70% 10%, #ffffff 0%, transparent 55%),' +
            'radial-gradient(90% 70% at 20% 95%, #e7e4de 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: 'radial-gradient(#8a8880 0.5px, transparent 0.5px)',
          backgroundSize: '4px 4px',
        }}
      />
      <div className="absolute inset-x-10 bottom-10">
        <p className="kicker-plain text-faint">Фотография появится после загрузки в админке</p>
      </div>
    </div>
  );
}

export function Hero({
  kicker,
  titleTop,
  titleItalic,
  lead,
  imageUrl,
  imageCaption,
}: HeroProps) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reduce) {
        gsap.set('.gs-fade', { opacity: 1 });
        gsap.set(gsap.utils.toArray<HTMLElement>('.hero-line', root.current), { y: 0 });
        gsap.set('.hero-photo', { clipPath: 'none' });
        gsap.set('.hero-photo-inner', { scale: 1 });
        return;
      }

      // Стартовые состояния ставим явно, а анимируем только через .to().
      // fromTo внутри таймлайна повторно применял стартовые значения при
      // перерасчёте, и строки заголовка залипали под маской.
      // Смещение строк считаем в пикселях от высоты самой строки.
      // С yPercent анимация не доезжала: проценты пересчитываются при
      // обновлении ScrollTrigger и затирали конечное значение.
      const lines = gsap.utils.toArray<HTMLElement>('.hero-line', root.current);
      lines.forEach((line) => gsap.set(line, { y: line.offsetHeight * 1.15 }));
      gsap.set('.hero-photo', { clipPath: 'inset(100% 0% 0% 0%)' });
      gsap.set('.hero-photo-inner', { scale: 1.18 });
      gsap.set(['.hero-kicker', '.hero-lead', '.hero-cta'], { y: 18 });

      // Вступление: шторка фото и построчный выезд заголовка.
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .to('.hero-photo', { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.out' })
        .to('.hero-photo-inner', { scale: 1, duration: 1.8, ease: 'expo.out' }, 0)
        .to('.hero-kicker', { opacity: 1, y: 0, duration: 0.6 }, 0.25)
        .to(lines, { y: 0, duration: 1.05, stagger: 0.11 }, 0.35)
        .to('.hero-lead', { opacity: 1, y: 0, duration: 0.8 }, 0.85)
        .to('.hero-cta', { opacity: 1, y: 0, duration: 0.7 }, 1);


      // Скролл: фото уезжает медленнее текста — глубина.
      gsap.to('.hero-photo-inner', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('.hero-copy', {
        yPercent: -14,
        opacity: 0.25,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      });
    },
    { scope: root },
  );

  const photo = (
    <div className="hero-photo absolute inset-0 overflow-hidden">
      <div className="hero-photo-inner absolute inset-0">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <PhotoPlate />
        )}
      </div>
      {imageCaption ? (
        <p className="kicker-plain absolute bottom-8 left-8 text-white/70">{imageCaption}</p>
      ) : null}
    </div>
  );

  const copy = (
    <div className="hero-copy">
      <p className="hero-kicker kicker gs-fade">{kicker}</p>

      <h1 className="display mt-8 text-[clamp(2.25rem,4.6vw,4rem)]">
        <MaskedLine>{titleTop}</MaskedLine>
        <MaskedLine italic>{titleItalic}</MaskedLine>
      </h1>

      <p className="hero-lead gs-fade text-muted mt-8 max-w-[46ch] text-[1.0625rem] leading-[1.75]">
        {lead}
      </p>

      <div className="hero-cta gs-fade mt-11 flex flex-wrap items-center gap-8">
        <Link
          href="/excursions"
          className="bg-ink text-bg hover:bg-ink-soft inline-flex cursor-pointer items-center px-10 py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          Выбрать экскурсию
        </Link>
        <Link
          href="/contacts"
          className="link-underline text-ink cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase"
        >
          Задать вопрос
        </Link>
      </div>
    </div>
  );

  return (
    <section ref={root} className="relative min-h-svh overflow-hidden">
      <div className="grid min-h-svh lg:grid-cols-[46fr_54fr]">
        <div className="order-2 flex items-center px-6 pt-14 pb-20 sm:px-10 lg:order-1 lg:px-16 xl:px-24">
          {copy}
        </div>
        <div className="relative order-1 min-h-[46svh] lg:order-2 lg:min-h-svh">{photo}</div>
      </div>
    </section>
  );
}
