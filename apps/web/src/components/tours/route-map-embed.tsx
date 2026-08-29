import type { RoutePointDto } from '@/lib/types';

/**
 * Карта маршрута на виджете Яндекс.Карт.
 *
 * Ключ API здесь не нужен — в отличие от JS-версии (route-map.tsx), которая
 * без NEXT_PUBLIC_YANDEX_MAPS_API_KEY просто не запускается. Поэтому виджет
 * работает всегда, а JS-карта включается сама, когда ключ появится: она умеет
 * рисовать линию маршрута и нумерованные метки в цвете сайта, чего виджет не
 * позволяет — стили меток он игнорирует.
 */
export function RouteMapEmbed({ points }: { points: RoutePointDto[] }) {
  if (points.length === 0) return null;

  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  // Запас по краям, чтобы метки не липли к рамке. Он же спасает случай
  // единственной точки, когда охват иначе схлопнулся бы в ноль.
  const pad = 0.004;
  const bbox = [
    (Math.min(...lngs) - pad).toFixed(5),
    (Math.min(...lats) - pad).toFixed(5),
    '~',
    (Math.max(...lngs) + pad).toFixed(5),
    (Math.max(...lats) + pad).toFixed(5),
  ];
  const bboxParam = `${bbox[0]},${bbox[1]}~${bbox[3]},${bbox[4]}`;
  const ptParam = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join('~');

  const src =
    'https://yandex.ru/map-widget/v1/?lang=ru_RU' +
    `&bbox=${encodeURIComponent(bboxParam)}` +
    `&pt=${encodeURIComponent(ptParam)}`;

  return (
    <div className="border-line mb-8 border">
      <iframe
        src={src}
        title="Карта маршрута экскурсии"
        loading="lazy"
        className="block h-[26rem] w-full"
        allowFullScreen
      />
    </div>
  );
}
