import { formatDuration, formatPrice, type PriceType } from '@tver/shared';

export { formatDuration, formatPrice };

/** «от 1 200 ₽ / человек» или «6 000 ₽ / группа». */
export function priceLabel(kopecks: number, priceType: PriceType): string {
  const suffix = priceType === 'per_person' ? 'человек' : 'группа';
  return `${formatPrice(kopecks)} / ${suffix}`;
}

/**
 * Все даты на сайте — московские.
 *
 * Без явного пояса сервер считал бы в UTC, а браузер гостя — по своему
 * поясу: одна и та же экскурсия показывалась бы в разное время до и после
 * гидратации. Экскурсии идут в Твери, значит и время тверское.
 */
const MSK = 'Europe/Moscow';

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: MSK,
});

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: MSK,
});

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value));
}

export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

/** «до 15 человек» / «до 4 человек» / «от 1 человека». */
export function groupLabel(min: number, max: number | null): string {
  if (max) return `до ${max} чел.`;
  return `от ${min} чел.`;
}

/** Порядок важности бейджей: «Хит» и «Авторский» информативнее прочих. */
const badgePriority = ['hit', 'exclusive', 'author-route', 'first-visit', 'popular'];

export function primaryBadge<T extends { slug: string }>(badges: T[]): T | undefined {
  if (badges.length === 0) return undefined;
  return [...badges].sort(
    (a, b) =>
      (badgePriority.indexOf(a.slug) + 1 || 99) - (badgePriority.indexOf(b.slug) + 1 || 99),
  )[0];
}

/**
 * Абсолютный адрес аватара. Ключ приходит с профилем, база — тот же адрес
 * API, который раздаёт остальные картинки из хранилища.
 */
export function avatarUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return `${base}/images/${key}`;
}
