'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Широкая фотополоса между секциями — передышка для глаза и смена ритма.
 * Раньше здесь была сетка из выдуманных градиентных плиток; в этом жанре
 * фальшивая картинка заметна сразу, поэтому оставлен один настоящий кадр.
 */
export function PhotoBand() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      // Кадр крупнее контейнера и медленно проезжает — эффект глубины.
      gsap.fromTo(
        '.band-img',
        { yPercent: -8 },
        {
          yPercent: 8,
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      );
      gsap.fromTo(
        '.band-caption',
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: root.current, start: 'top 65%', once: true },
        },
      );
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative h-[62svh] overflow-hidden md:h-[78svh]" aria-label="Тверь">
      <div className="absolute inset-0 overflow-hidden">
        {/* Запас по высоте, чтобы параллакс не оголял края. Точка привязки
            смещена вверх по кадру: при центрировании дворец обрезало сверху,
            а ради него полоса и стоит. */}
        <img
          src="/photos/putevoy-dvorets.jpg"
          srcSet="/photos/putevoy-dvorets-900.webp 900w, /photos/putevoy-dvorets.jpg 1280w"
          sizes="100vw"
          alt="Императорский путевой дворец в Твери"
          loading="lazy"
          decoding="async"
          className="band-img absolute inset-x-0 top-[-10%] h-[120%] w-full object-cover object-[50%_18%]"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
      <div className="absolute right-6 bottom-8 left-6 sm:right-10 sm:bottom-12 sm:left-10">
        <p className="band-caption kicker-plain text-white/75">
          Императорский путевой дворец · обзорная экскурсия
        </p>
      </div>
    </section>
  );
}
