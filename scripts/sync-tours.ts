/**
 * Синхронизирует содержимое экскурсий из seed-данных с работающим API.
 *
 *   node --experimental-strip-types scripts/sync-tours.ts <пароль> [базовый-URL]
 *
 * Зачем отдельный скрипт: seedDatabase идемпотентен и использует
 * onConflictDoNothing, поэтому существующие туры он не обновляет. Здесь же
 * тексты, цены и маршруты переносятся в уже наполненную базу через админский
 * API — без пересоздания записей, так что брони и отзывы не теряются.
 */
import { seedTours } from '../packages/db/src/seed/data.ts';

const password = process.argv[2];
const baseUrl = (process.argv[3] ?? 'http://localhost:8787').replace(/\/$/, '');

if (!password) {
  console.error('Использование: node --experimental-strip-types scripts/sync-tours.ts <пароль> [URL]');
  process.exit(1);
}

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

for (const tour of seedTours) {
  const payload = {
    slug: tour.slug,
    title: tour.title,
    subtitle: tour.subtitle,
    shortDescription: tour.shortDescription,
    fullDescription: tour.fullDescription,
    program: tour.program,
    routePoints: tour.routePoints.map(({ title, lat, lng }) => ({ title, lat, lng })),
    price: tour.price,
    priceType: tour.priceType,
    durationMinutes: tour.durationMinutes,
    groupMin: tour.groupMin,
    groupMax: tour.groupMax ?? undefined,
    meetingPoint: tour.meetingPoint,
    meetingLat: tour.meetingLat,
    meetingLng: tour.meetingLng,
    included: tour.included,
    notIncluded: tour.notIncluded,
    recommendations: tour.recommendations,
    badgeSlugs: tour.badgeSlugs,
    sortOrder: tour.sortOrder,
  };

  await call(`/admin/tours/${tour.id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify(payload),
  });
  console.log(`обновлено: ${tour.slug} — ${tour.title}`);
}

console.log(`\nГотово: ${seedTours.length} экскурсии синхронизированы с ${baseUrl}`);
