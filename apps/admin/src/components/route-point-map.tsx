'use client';

import { LngLatBounds, Map as MlMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ATTRIBUTION, mapStyle } from '@tver/shared/map';

/**
 * Адрес воркера указываем явно: библиотека вычисляет его из адреса своего
 * модуля, а в сборке это хешированный кусок, рядом с которым воркера нет.
 * Копию в public/ кладёт scripts/copy-map-worker.mjs.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/** Тверь: сюда смотрим, пока ни у одной точки нет координат. */
const TVER: [number, number] = [35.9, 56.86];

export interface PickerPoint {
  title: string;
  lat: string;
  lng: string;
}

interface Found {
  lat: number;
  lng: number;
  label: string;
}

/** Координаты строкой из формы — в числа, если они вообще осмысленны. */
function coords(p: PickerPoint): [number, number] | null {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!p.lat.trim() || !p.lng.trim() || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

/**
 * Поиск места по названию через геокодер OpenStreetMap.
 *
 * Ищем с уклоном в Тверскую область: на общих названиях вроде «водонапорная
 * башня» геокодер иначе уводит за сотни километров. Результат всё равно
 * положено проверить глазами и при необходимости подвинуть метку.
 */
async function geocode(query: string, signal: AbortSignal): Promise<Found[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ru' +
    '&countrycodes=ru' +
    // Рамка вокруг Тверской области — подсказка о приоритете, не фильтр.
    '&viewbox=35.0,57.4,37.2,56.2&bounded=0' +
    `&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Геокодер ответил ${response.status}`);
  const data: { lat: string; lon: string; display_name: string }[] = await response.json();
  return data.map((item) => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    label: item.display_name,
  }));
}

export default function RoutePointMap({
  points,
  activeIndex,
  onSelect,
  onMove,
}: {
  points: PickerPoint[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onMove: (index: number, lat: number, lng: number) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Обработчики держим в ссылках: карта создаётся один раз, а колбэки
  // приходят новые на каждый рендер формы.
  const handlers = useRef({ onSelect, onMove, activeIndex });
  handlers.current = { onSelect, onMove, activeIndex };

  useEffect(() => {
    const container = holder.current;
    if (!container) return;

    const instance = new MlMap({
      container,
      style: mapStyle,
      center: TVER,
      zoom: 12,
      attributionControl: { compact: false, customAttribution: ATTRIBUTION },
    });
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    // Клик по карте ставит активную точку — самый прямой способ «вот сюда».
    instance.on('click', (event) => {
      handlers.current.onMove(handlers.current.activeIndex, event.lngLat.lat, event.lngLat.lng);
    });

    instance.on('load', () => setReady(true));
    map.current = instance;

    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  const key = points.map((p) => `${p.lat},${p.lng},${p.title}`).join('|');

  // Метки пересобираем целиком: точек единицы, а следить за каждой по
  // отдельности — лишняя сложность на ровном месте.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    markers.current.forEach((m) => m.remove());
    markers.current = [];

    points.forEach((point, index) => {
      const position = coords(point);
      if (!position) return;

      const el = document.createElement('button');
      el.type = 'button';
      el.className = `pick-pin${index === activeIndex ? ' is-active' : ''}`;
      el.title = point.title || `Точка ${index + 1}`;
      el.setAttribute('aria-label', `Точка ${index + 1}${point.title ? `: ${point.title}` : ''}`);
      const inner = document.createElement('span');
      inner.textContent = String(index + 1);
      el.appendChild(inner);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        handlers.current.onSelect(index);
      });

      const marker = new Marker({ element: el, draggable: true })
        .setLngLat(position)
        .addTo(instance);

      marker.on('dragstart', () => handlers.current.onSelect(index));
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLngLat();
        handlers.current.onMove(index, lat, lng);
      });

      markers.current.push(marker);
    });
  }, [key, activeIndex, ready, points]);

  // Первый показ подгоняем под все точки, дальше не мешаем: иначе карта
  // прыгала бы при каждой правке координат.
  const fitted = useRef(false);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || fitted.current) return;
    const filled = points.map(coords).filter((c): c is [number, number] => c !== null);
    if (filled.length === 0) return;
    const bounds = new LngLatBounds();
    filled.forEach((c) => bounds.extend(c));
    instance.fitBounds(bounds, { padding: 60, maxZoom: 15, animate: false });
    fitted.current = true;
  }, [ready, points]);

  const search = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    setError(null);
    setResults(null);
    const controller = new AbortController();
    try {
      const found = await geocode(text, controller.signal);
      if (found.length === 0) setError('Ничего не нашлось. Попробуйте добавить улицу или город.');
      else setResults(found);
    } catch {
      setError('Геокодер недоступен. Поставьте точку кликом по карте.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const apply = (found: Found) => {
    onMove(activeIndex, found.lat, found.lng);
    map.current?.easeTo({ center: [found.lng, found.lat], zoom: 16, duration: 600 });
    setResults(null);
    setQuery('');
  };

  const activeTitle = points[activeIndex]?.title?.trim();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Форма тура вокруг — Enter здесь не должен её отправлять.
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
          placeholder="Найти место: «Староволжский мост, Тверь»"
          className="input flex-1 min-w-[14rem]"
          aria-label="Поиск места"
        />
        <button type="button" onClick={() => void search()} disabled={searching} className="btn-secondary">
          {searching ? 'Ищем…' : 'Найти'}
        </button>
      </div>

      <p className="text-muted text-xs leading-relaxed">
        Ставим точку{' '}
        <strong className="text-ink">
          {activeIndex + 1}
          {activeTitle ? ` — ${activeTitle}` : ''}
        </strong>
        . Найдите место, кликните по карте или перетащите метку. Геокодер часто промахивается на
        общих названиях, поэтому итог всегда проверяйте глазами.
      </p>

      {error ? <p className="text-danger text-xs">{error}</p> : null}

      {results ? (
        <ul className="border-line divide-line divide-y border">
          {results.map((found) => (
            <li key={`${found.lat},${found.lng}`}>
              <button
                type="button"
                onClick={() => apply(found)}
                className="hover:bg-surface-soft block w-full cursor-pointer px-4 py-3 text-left text-xs leading-relaxed"
              >
                {found.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={holder} className="route-map border-line h-[24rem] w-full border" />
    </div>
  );
}
