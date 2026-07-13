'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { StarIcon } from '@/components/ui/icons';

export function Hero({
  tagline,
  subtitle,
  stats,
}: {
  tagline: string;
  subtitle: string;
  stats: { tours: number; rating: number };
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const skylineY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 120]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -60]);

  return (
    <section ref={ref} className="relative flex min-h-svh items-center overflow-hidden pt-16">
      {/* Тёплое небо и мягкие пятна света */}
      <div className="from-cream-100 via-cream-50 to-sand-200 absolute inset-0 bg-gradient-to-b" aria-hidden />
      <div className="bg-terra-500/15 absolute -top-24 right-[-10%] h-96 w-96 rounded-full blur-3xl" aria-hidden />
      <div className="bg-sand-400/25 absolute top-1/3 left-[-8%] h-80 w-80 rounded-full blur-3xl" aria-hidden />

      {/* Параллакс-силуэт города */}
      <motion.svg
        style={{ y: skylineY }}
        viewBox="0 0 1440 220"
        preserveAspectRatio="xMidYMax slice"
        className="text-bark-700/25 absolute bottom-0 left-0 h-40 w-full md:h-56"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0 220V150l60-8 30-40 30 40 50 6 40-24 40 24 70 8 20-70 14-22 14 22 20 70 90 6 30-36 30 36 80 8 24-50 16 50 100 6 40-30 40 30 60 4 30-60 18-26 18 26 30 60 70 6 40-22 40 22 60 8 30-44 30 44 66 8v88H0Z"
        />
      </motion.svg>

      <Container className="relative pt-10 pb-28">
        <motion.div style={{ y: contentY }} className="max-w-3xl">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-terra-600 mb-5 text-sm font-semibold tracking-widest uppercase"
          >
            Авторские экскурсии по Твери
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.2 }}
            className="font-display text-ink-900 text-4xl leading-[1.1] font-semibold text-balance sm:text-5xl md:text-6xl"
          >
            {tagline}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.35 }}
            className="text-bark-700 mt-6 max-w-xl text-lg leading-relaxed"
          >
            {subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.5 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Button href="/excursions" size="lg">
              Выбрать экскурсию
            </Button>
            <Button href="/about" size="lg" variant="secondary">
              Как это проходит
            </Button>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="glass shadow-soft mt-12 inline-flex flex-wrap gap-x-10 gap-y-4 rounded-3xl px-7 py-5"
          >
            <div>
              <dt className="text-bark-600 text-xs font-medium uppercase">Маршрутов</dt>
              <dd className="text-ink-900 font-display text-2xl font-semibold">{stats.tours}</dd>
            </div>
            <div>
              <dt className="text-bark-600 text-xs font-medium uppercase">Рейтинг гостей</dt>
              <dd className="text-ink-900 font-display flex items-center gap-1.5 text-2xl font-semibold">
                {stats.rating.toFixed(1).replace('.', ',')}
                <StarIcon className="text-terra-500 h-5 w-5" />
              </dd>
            </div>
            <div>
              <dt className="text-bark-600 text-xs font-medium uppercase">Группы</dt>
              <dd className="text-ink-900 font-display text-2xl font-semibold">до 15 чел.</dd>
            </div>
          </motion.dl>
        </motion.div>
      </Container>
    </section>
  );
}
