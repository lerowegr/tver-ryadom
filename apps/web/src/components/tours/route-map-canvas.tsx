'use client';

import {
  AttributionControl,
  LngLatBounds,
  Map as MlMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ATTRIBUTION, mapStyle } from '@tver/shared/map';
import type { RoutePointDto } from '@/lib/types';

/**
 * Адрес воркера указываем явно.
 *
 * С шестой версии библиотека держит воркер отдельным файлом и вычисляет путь
 * к нему из адреса собственного модуля. В сборке это хешированный кусок в
 * /_next/static/chunks, рядом с которым воркера нет: сборщик не распознаёт
 * динамический шаблон и файл не выкладывает. Воркер не стартует, карта
 * остаётся пустой — и ни одной ошибки в консоли.
 *
 * Копию в public/ кладёт scripts/copy-map-worker.mjs перед запуском и сборкой.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/** Запас вокруг крайних точек, чтобы метки не липли к рамке. */
const PADDING = { top: 64, right: 48, bottom: 64, left: 48 };

/** Подписи интерфейса карты — библиотека по умолчанию говорит по-английски. */
const locale = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + колесо — масштаб карты',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + колесо — масштаб карты',
  'CooperativeGesturesHandler.MobileHelpText': 'Двумя пальцами — масштаб карты',
  'NavigationControl.ZoomIn': 'Приблизить',
  'NavigationControl.ZoomOut': 'Отдалить',
  'NavigationControl.ResetBearing': 'Повернуть на север',
  'Popup.Close': 'Закрыть',
};

/** Квадрат с номером — тот же знак, что в программе экскурсии. */
function pinElement(index: number, title: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'route-pin';
  // Кнопка 44×44 при видимом квадрате в 30: палец попадает, рисунок не толстеет.
  el.setAttribute('aria-label', `Точка ${index + 1}: ${title}`);
  const inner = document.createElement('span');
  inner.textContent = String(index + 1);
  el.appendChild(inner);
  return el;
}

/** Содержимое окошка: номер, название и короткое пояснение, если оно есть. */
function popupContent(point: RoutePointDto, index: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'route-popup';

  const num = document.createElement('p');
  num.className = 'route-popup__num';
  num.textContent = `Точка ${String(index + 1).padStart(2, '0')}`;
  wrap.appendChild(num);

  const title = document.createElement('p');
  title.className = 'route-popup__title';
  title.textContent = point.title;
  wrap.appendChild(title);

  if (point.description) {
    const desc = document.createElement('p');
    desc.className = 'route-popup__text';
    desc.textContent = point.description;
    wrap.appendChild(desc);
  }

  return wrap;
}

export default function RouteMapCanvas({ points }: { points: RoutePointDto[] }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const key = points.map((p) => `${p.lng},${p.lat}`).join('|');

  useEffect(() => {
    const container = holder.current;
    if (!container || points.length === 0) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const map = new MlMap({
      container,
      style: mapStyle,
      // Стартовый вид перекрывается fitBounds ниже, но без него карта
      // успевает мигнуть нулевым меридианом.
      center: [points[0]!.lng, points[0]!.lat],
      zoom: 12,
      attributionControl: false,
      // Иначе карта перехватывает прокрутку страницы — та же ловушка,
      // что была с лентой отзывов.
      cooperativeGestures: true,
      locale,
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new AttributionControl({ compact: false, customAttribution: ATTRIBUTION }),
      'bottom-right',
    );
    map.keyboard.enable();

    const bounds = new LngLatBounds();
    points.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: PADDING, maxZoom: 15, animate: false });

    const markers: Marker[] = [];
    let openPopup: Popup | null = null;
    let openPin: HTMLElement | null = null;

    const onLoad = () => {
      // Пунктир между точками: это схема порядка обхода, а не проложенная
      // дорога, и пунктир честно об этом говорит.
      if (points.length > 1) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
          },
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#14140f',
            'line-width': 1.5,
            'line-opacity': 0.45,
            'line-dasharray': [1, 2.5],
          },
        });
      }

      points.forEach((point, index) => {
        const el = pinElement(index, point.title);
        const popup = new Popup({
          offset: 22,
          closeButton: false,
          maxWidth: '17rem',
          className: 'route-popup-shell',
        }).setDOMContent(popupContent(point, index));

        popup.on('close', () => {
          el.classList.remove('is-open');
          if (openPin === el) {
            openPopup = null;
            openPin = null;
          }
        });

        el.addEventListener('click', () => {
          // Открыто может быть только одно окошко: два перекрывают друг друга.
          if (openPopup && openPopup !== popup) openPopup.remove();
          if (openPin && openPin !== el) openPin.classList.remove('is-open');
          openPopup = popup;
          openPin = el;
          el.classList.add('is-open');
        });

        markers.push(
          new Marker({ element: el }).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map),
        );
      });
    };

    map.on('load', onLoad);

    // Тайлы приходят со стороннего сервиса: он может быть недоступен, и тогда
    // вместо пустого серого прямоугольника честнее сказать об этом словами —
    // список точек под картой никуда не делся.
    map.on('error', (event) => {
      console.error('[карта маршрута]', event.error);
      setFailed(true);
    });

    // Контейнер меняет ширину вместе с колонкой страницы.
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container);

    if (reduce) map.setMaxPitch(0);

    return () => {
      resize.disconnect();
      markers.forEach((m) => m.remove());
      map.remove();
    };
    // Зависимость — ключ по координатам, а не сам массив: он приходит из
    // серверного компонента новой ссылкой на каждый рендер, и карта
    // пересоздавалась бы впустую.
  }, [key]);

  return (
    <div className="relative">
      <div ref={holder} className="route-map h-[26rem] w-full md:h-[32rem]" />
      {failed ? (
        <p className="bg-surface-soft text-muted absolute inset-0 flex items-center justify-center px-8 text-center text-sm">
          Карта сейчас недоступна. Точки маршрута перечислены ниже.
        </p>
      ) : null}
    </div>
  );
}
