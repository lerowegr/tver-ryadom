'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { RoutePointDto } from '@/lib/types';

/**
 * Карта маршрута на MapLibre с тайлами OpenStreetMap.
 *
 * Библиотека весит около 200 КБ, поэтому грузится отдельным куском и только
 * когда читатель до карты доскроллил: на странице экскурсии она стоит ниже
 * описания и программы, и большинство до неё вообще не доходит.
 */
const RouteMapCanvas = dynamic(() => import('@/components/tours/route-map-canvas'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

function MapPlaceholder({ label = 'Загружаем карту…' }: { label?: string }) {
  return (
    <div
      className="bg-surface-soft flex h-[26rem] w-full items-center justify-center md:h-[32rem]"
      aria-hidden
    >
      <p className="kicker-plain text-faint">{label}</p>
    </div>
  );
}

export function RouteMap({ points }: { points: RoutePointDto[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // Начинаем загрузку заранее, чтобы к моменту появления карта была готова.
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

  return (
    <div className="border-line mb-8 border">
      <div ref={ref}>{near ? <RouteMapCanvas points={points} /> : <MapPlaceholder label="Карта маршрута" />}</div>
    </div>
  );
}
