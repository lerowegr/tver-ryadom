'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- внешний нетипизированный API Яндекс.Карт v3 */

import { useEffect, useRef, useState } from 'react';
import type { RoutePointDto } from '@/lib/types';

declare global {
  interface Window {
    ymaps3?: any;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadYandexMaps(key: string): Promise<void> {
  if (window.ymaps3) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Не удалось загрузить Яндекс.Карты'));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/**
 * Интерактивная карта маршрута (Яндекс.Карты v3).
 * Без NEXT_PUBLIC_YANDEX_MAPS_API_KEY или при ошибке загрузки ничего не рендерит —
 * список точек маршрута всегда выводится рядом серверным компонентом.
 */
export function RouteMap({ points }: { points: RoutePointDto[] }) {
  const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key || points.length === 0 || !containerRef.current) return;
    let destroyed = false;
    let map: any;

    (async () => {
      try {
        await loadYandexMaps(key);
        const ymaps3 = window.ymaps3;
        await ymaps3.ready;
        if (destroyed || !containerRef.current) return;

        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker, YMapFeature } =
          ymaps3;

        const lngs = points.map((p) => p.lng);
        const lats = points.map((p) => p.lat);
        const pad = 0.004;
        map = new YMap(containerRef.current, {
          location: {
            bounds: [
              [Math.min(...lngs) - pad, Math.max(...lats) + pad],
              [Math.max(...lngs) + pad, Math.min(...lats) - pad],
            ],
          },
        });
        map.addChild(new YMapDefaultSchemeLayer());
        map.addChild(new YMapDefaultFeaturesLayer());

        if (points.length > 1) {
          map.addChild(
            new YMapFeature({
              geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
              style: { stroke: [{ color: '#14140f', width: 3 }] },
            }),
          );
        }

        points.forEach((point, i) => {
          const el = document.createElement('div');
          el.textContent = String(i + 1);
          el.title = point.title;
          el.style.cssText =
            'width:28px;height:28px;background:#14140f;color:#fdfcfa;' +
            'display:flex;align-items:center;justify-content:center;font-weight:700;' +
            'font-size:13px;box-shadow:0 2px 8px rgba(42,32,20,.35);transform:translate(-50%,-50%);cursor:default';
          map.addChild(new YMapMarker({ coordinates: [point.lng, point.lat] }, el));
        });
      } catch {
        if (!destroyed) setFailed(true);
      }
    })();

    return () => {
      destroyed = true;
      try {
        map?.destroy?.();
      } catch {
        /* карта уже уничтожена */
      }
    };
  }, [key, points]);

  if (!key || failed || points.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="border-line mb-8 h-80 w-full overflow-hidden border"
      role="application"
      aria-label="Карта маршрута"
    />
  );
}
