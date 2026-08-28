import type { RoutePointDto } from '@/lib/types';

/**
 * Неинтерактивная схема маршрута: точки раскладываются по реальным
 * координатам (нормализованным в рамку), между ними — плавная линия.
 * Показывается, когда не задан ключ Яндекс.Карт.
 */

const W = 800;
const H = 440;
const PAD = 70;

function project(points: RoutePointDto[]) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Широта/долгота вырождаются в точку, если маршрут из одной точки.
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);

  // Сохраняем пропорции: вписываем bounding box в рамку по большей стороне.
  const scale = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2) / spanLat);
  const offsetX = (W - spanLng * scale) / 2;
  const offsetY = (H - spanLat * scale) / 2;

  return points.map((p) => ({
    x: offsetX + (p.lng - minLng) * scale,
    y: H - (offsetY + (p.lat - minLat) * scale), // север сверху
    title: p.title,
  }));
}

/** Плавная кривая через точки (Catmull-Rom → Безье). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const path = [`M ${pts[0]!.x} ${pts[0]!.y}`];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  return path.join(' ');
}

export function RouteSchematic({ points }: { points: RoutePointDto[] }) {
  if (points.length === 0) return null;
  const projected = project(points);
  const path = smoothPath(projected);

  return (
    <figure className="border-line mb-8 overflow-hidden border">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Схема маршрута">
        {/* тёплая «бумажная» подложка с сеткой */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e7e4de" strokeWidth="1" />
          </pattern>
          <radialGradient id="paper" cx="30%" cy="20%" r="100%">
            <stop offset="0%" stopColor="#fdfcfa" />
            <stop offset="100%" stopColor="#f7f5f1" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#paper)" />
        <rect width={W} height={H} fill="url(#grid)" opacity="0.6" />
        {/* декоративная «река» */}
        <path
          d={`M -20 ${H * 0.82} Q ${W * 0.25} ${H * 0.7}, ${W * 0.5} ${H * 0.8} T ${W + 20} ${H * 0.74}`}
          fill="none"
          stroke="#d6d2ca"
          strokeWidth="26"
          strokeLinecap="round"
          opacity="0.35"
        />

        {/* линия маршрута */}
        {path ? (
          <>
            <path d={path} fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" />
            <path
              d={path}
              fill="none"
              stroke="#14140f"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="1 12"
            />
          </>
        ) : null}

        {/* точки с номерами и подписями */}
        {projected.map((point, i) => {
          const isEnd = i === 0 || i === projected.length - 1;
          const labelAbove = point.y > H / 2;
          return (
            <g key={`${point.title}-${i}`}>
              <circle cx={point.x} cy={point.y} r="17" fill="#ffffff" stroke="#14140f" strokeWidth={isEnd ? 3 : 2} />
              <circle cx={point.x} cy={point.y} r="12.5" fill={isEnd ? '#14140f' : '#f7f5f1'} />
              <text
                x={point.x}
                y={point.y + 4.5}
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill={isEnd ? '#fdfcfa' : '#55554f'}
                fontFamily="Arial, sans-serif"
              >
                {i + 1}
              </text>
              <text
                x={point.x}
                y={labelAbove ? point.y - 28 : point.y + 38}
                textAnchor="middle"
                fontSize="13.5"
                fontWeight="600"
                fill="#14140f"
                fontFamily="Arial, sans-serif"
                stroke="#fdfcfa"
                strokeWidth="4"
                paintOrder="stroke"
              >
                {point.title.length > 30 ? `${point.title.slice(0, 29)}…` : point.title}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-muted border-line border-t px-5 py-4 text-xs">
        Схема маршрута: расположение точек соответствует реальным координатам.
      </figcaption>
    </figure>
  );
}
