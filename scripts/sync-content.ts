/**
 * Переносит отзывы и настройки сайта из seed-данных в работающую базу.
 *
 *   node --experimental-strip-types scripts/sync-content.ts <пароль> [базовый-URL]
 *
 * Экскурсии переносит соседний sync-tours.ts; здесь то, что он не трогает.
 *
 * Отзывы удаляются выборочно — только демонстрационные, заведённые seed'ом
 * под известными идентификаторами. Всё, что написали живые люди через сайт,
 * остаётся на месте: перепутать эти две вещи было бы дорого.
 */
import { seedReviews } from '../packages/db/src/seed/data.ts';

const password = process.argv[2];
const baseUrl = (process.argv[3] ?? 'http://localhost:8787').replace(/\/$/, '');

if (!password) {
  console.error('Использование: node --experimental-strip-types scripts/sync-content.ts <пароль> [URL]');
  process.exit(1);
}

/** Идентификаторы выдуманных отзывов из первой версии seed'а. */
const DEMO_REVIEW_IDS = ['review-1', 'review-2', 'review-3', 'review-4', 'review-5'];

/** Настройки, которые нужно привести к текущему состоянию. */
const SETTINGS: Record<string, string> = {
  'contacts.vk': 'https://vk.ru/tverexkursii',
  // Пустая строка убирает канал из шапки, подвала и контактов: WhatsApp
  // заменён на МАКС, а ссылку на МАКС Елена поставит сама.
  'contacts.whatsapp': '',
  'schedule.intro':
    'Здесь публикуются даты экскурсий в составе сборной группы. Расписание обновляется каждый ' +
    'месяц — оно же выходит в группе ВКонтакте. Индивидуальную экскурсию можно заказать на любой ' +
    'свободный день на странице маршрута.',
};

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(`${path}: ${body.error?.message ?? res.status}`);
  }
  return body.data;
}

const { accessToken } = await call<{ accessToken: string }>('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@tver-ryadom.ru', password }),
});
const auth = { Authorization: `Bearer ${accessToken}` };

// ---- Отзывы ----------------------------------------------------------------

interface AdminReview {
  id: string;
  authorName: string;
  text: string;
}

// Предел страницы в API — 50; отзывов пока меньше, но берём обе страницы,
// чтобы скрипт не начал тихо пропускать записи, когда их станет больше.
const pages = await Promise.all(
  [1, 2].map((page) =>
    call<{ items: AdminReview[] }>(`/admin/reviews?limit=50&page=${page}`, { headers: auth }),
  ),
);
const existing = { items: pages.flatMap((p) => p.items) };

for (const review of existing.items) {
  if (!DEMO_REVIEW_IDS.includes(review.id)) continue;
  await call(`/admin/reviews/${review.id}`, { method: 'DELETE', headers: auth });
  console.log(`удалён демо-отзыв: ${review.authorName}`);
}

// Повторный запуск не должен плодить дубликаты, а идентификатор отзыва
// назначает сервер — поэтому сверяем по автору и первым словам текста.
const fingerprint = (r: { authorName: string; text: string }) =>
  `${r.authorName}|${r.text.slice(0, 60)}`;
const present = new Set(existing.items.map(fingerprint));

for (const review of seedReviews) {
  if (present.has(fingerprint(review))) {
    console.log(`уже есть: ${review.authorName}`);
    continue;
  }
  await call('/admin/reviews', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      tourId: review.tourId,
      authorName: review.authorName,
      rating: review.rating,
      text: review.text,
      status: 'approved',
      createdAt: review.createdAt.toISOString(),
    }),
  });
  console.log(`добавлен отзыв: ${review.authorName}`);
}

// ---- Настройки -------------------------------------------------------------

await call('/admin/settings', {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ entries: SETTINGS }),
});
console.log(`настройки обновлены: ${Object.keys(SETTINGS).join(', ')}`);

console.log(`\nГотово: контент синхронизирован с ${baseUrl}`);
