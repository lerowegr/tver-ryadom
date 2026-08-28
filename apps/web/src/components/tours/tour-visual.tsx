/**
 * Визуал карточки экскурсии: реальное фото из R2 (когда загружено через админку)
 * либо тёплая графическая заглушка с силуэтом достопримечательности.
 */
import type { TourImageDto } from '@/lib/types';

const palettes = [
  ['#efede8', '#8a8880'],
  ['#e7e4de', '#6b6b66'],
  ['#f7f5f1', '#b8b4ab'],
];

function hashOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 997;
  return hash;
}

/** Стилизованные силуэты Твери: мост, храм, набережная. */
const silhouettes = [
  // Староволжский мост
  'M0 86 L14 86 L20 74 Q32 58 44 74 L50 86 L64 86 L70 72 Q82 55 94 72 L100 86 L120 86 L120 100 L0 100 Z',
  // Храм с колокольней
  'M0 100 L0 88 L26 88 L26 70 L32 70 L32 58 L36 46 L40 58 L40 70 L46 70 L46 88 L62 88 L62 64 L70 52 L78 64 L78 88 L120 88 L120 100 Z',
  // Набережная и деревья
  'M0 100 L0 90 L18 90 L18 78 Q26 66 34 78 L34 90 L52 90 L52 82 Q60 70 68 82 L68 90 L88 90 L88 74 L94 74 L94 66 L98 58 L102 66 L102 74 L108 74 L108 90 L120 90 L120 100 Z',
];

export function TourVisual({
  slug,
  title,
  image,
  variant = 'card',
  className = '',
}: {
  slug: string;
  title: string;
  image: TourImageDto | null;
  variant?: 'card' | 'hero';
  className?: string;
}) {
  const src = image?.variants?.[variant] ?? image?.variants?.card;
  if (src) {
    // Обычный <img>: варианты уже подготовлены при загрузке в R2, next/image не нужен.
    return <img src={src} alt={image?.alt ?? title} className={`h-full w-full object-cover ${className}`} />;
  }

  const idx = hashOf(slug) % palettes.length;
  const [from, to] = palettes[idx] ?? ['#efede8', '#8a8880'];
  const path = silhouettes[idx] ?? silhouettes[0];

  return (
    <svg
      viewBox="0 0 120 100"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`g-${slug}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="120" height="100" fill={`url(#g-${slug})`} />
      <circle cx="92" cy="26" r="12" fill="#fbf9f4" opacity="0.55" />
      <path d={path} fill="#2a2014" opacity="0.28" />
    </svg>
  );
}
