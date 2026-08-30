import { bookings, schedules, tours, type Db } from '@tver/db';
import { formatPrice } from '@tver/shared';
import { and, eq, gt, inArray, or } from 'drizzle-orm';
import { formatMsk } from '../notifications/templates';
import { aboutText, welcomeText } from '../bot/screens';
import { ensureAccount, type ChannelId } from './accounts';

/**
 * Экраны, не знающие про транспорт.
 *
 * Telegram рисует богатые карточки с фотографиями средствами grammy, а у
 * ВКонтакте и MAX своя разметка клавиатур. Общее у них одно — что показать.
 * Здесь только текст и список кнопок; как их отправить, решает адаптер
 * канала.
 */

export interface Button {
  /** Подпись на кнопке. */
  label: string;
  /** Действие: тот же словарь, что у Telegram-кнопок. */
  action: string;
}

export interface Screen {
  text: string;
  buttons: Button[][];
}

function plain(value: string): string {
  // Во ВКонтакте и MAX разметки нет — теги Telegram убираем.
  return value.replace(/<[^>]+>/g, '');
}

export const MENU_BUTTONS: Button[][] = [
  [{ label: '🗺 Экскурсии', action: 't:list' }],
  [
    { label: '📋 Мои брони', action: 'my:list' },
    { label: '👤 Кабинет', action: 'me' },
  ],
  [{ label: 'ℹ️ Про экскурсии', action: 'about' }],
];

export async function menuScreen(db: Db): Promise<Screen> {
  return { text: plain(await welcomeText(db)), buttons: MENU_BUTTONS };
}

export async function aboutScreen(db: Db): Promise<Screen> {
  return {
    text: plain(await aboutText(db)),
    buttons: [
      [{ label: '🗺 Экскурсии', action: 't:list' }],
      [{ label: '← Меню', action: 'menu' }],
    ],
  };
}

export async function toursScreen(db: Db): Promise<Screen> {
  const list = await db.query.tours.findMany({
    where: eq(tours.status, 'published'),
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });
  if (list.length === 0) {
    return { text: 'Экскурсий пока нет — загляните позже.', buttons: [[{ label: '← Меню', action: 'menu' }]] };
  }

  const lines = list.map((tour) => {
    const price = `${formatPrice(tour.price)} ${tour.priceType === 'per_person' ? 'за человека' : 'за группу'}`;
    const hours = Math.round((tour.durationMinutes / 60) * 10) / 10;
    return `• ${tour.title}\n  ${price}, ${String(hours).replace('.', ',')} ч\n  ${tour.shortDescription}`;
  });

  return {
    text: `Маршруты:\n\n${lines.join('\n\n')}`,
    buttons: [
      ...list.map((tour) => [{ label: tour.title.slice(0, 38), action: `t:${tour.id}` }]),
      [{ label: '← Меню', action: 'menu' }],
    ],
  };
}

export async function tourScreen(db: Db, tourId: string): Promise<Screen> {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.id, tourId), eq(tours.status, 'published')),
    with: { routePoints: { orderBy: (p, { asc }) => [asc(p.sortOrder)] } },
  });
  if (!tour) {
    return { text: 'Экскурсия не найдена.', buttons: [[{ label: '← Меню', action: 'menu' }]] };
  }

  const route = tour.routePoints?.length
    ? `\n\nМаршрут:\n${tour.routePoints.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}`
    : '';

  return {
    text: `${tour.title}\n\n${tour.fullDescription}${route}`.slice(0, 3800),
    buttons: [
      [{ label: '← К списку', action: 't:list' }],
      [{ label: '← Меню', action: 'menu' }],
    ],
  };
}

export async function bookingsScreen(
  db: Db,
  channel: ChannelId,
  externalId: string,
  displayName: string,
): Promise<Screen> {
  const account = await ensureAccount(db, channel, externalId, displayName);
  const now = new Date();
  const futureSlots = db
    .select({ id: schedules.id })
    .from(schedules)
    .where(gt(schedules.startsAt, now));

  const found = await db.query.bookings.findMany({
    where: and(
      eq(bookings.userId, account.id),
      inArray(bookings.status, ['pending', 'confirmed']),
      or(inArray(bookings.scheduleId, futureSlots), gt(bookings.desiredDate, now)),
    ),
    with: { tour: { columns: { title: true } }, schedule: { columns: { startsAt: true } } },
    limit: 20,
  });

  if (found.length === 0) {
    return {
      text: 'Предстоящих экскурсий нет.',
      buttons: [
        [{ label: '🗺 Выбрать экскурсию', action: 't:list' }],
        [{ label: '← Меню', action: 'menu' }],
      ],
    };
  }

  const lines = found
    .map((b) => ({ ...b, when: b.schedule?.startsAt ?? b.desiredDate ?? null }))
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0))
    .map((b) => {
      const when = b.when
        ? `${formatMsk(b.when)}${b.schedule ? '' : ' (дата на согласовании)'}`
        : 'дата согласовывается';
      const mark = b.status === 'confirmed' ? '✅' : '🕐';
      return `${mark} ${b.tour?.title ?? 'Экскурсия'}\n  ${when} · ${b.peopleCount} чел. · ${formatPrice(b.totalPrice)}`;
    });

  return { text: `Ваши брони:\n\n${lines.join('\n\n')}`, buttons: [[{ label: '← Меню', action: 'menu' }]] };
}

export async function cabinetScreen(
  db: Db,
  channel: ChannelId,
  externalId: string,
  displayName: string,
): Promise<Screen> {
  const account = await ensureAccount(db, channel, externalId, displayName);
  return {
    text: [
      'Личный кабинет',
      '',
      `Имя: ${account.name}`,
      `Телефон: ${account.phone ?? 'не указан'}`,
      `Почта: ${account.email ?? 'не указана'}`,
      '',
      'Эти же данные видны на сайте и в других мессенджерах — запись одна.',
    ].join('\n'),
    buttons: [
      [{ label: '📋 Мои брони', action: 'my:list' }],
      [{ label: '← Меню', action: 'menu' }],
    ],
  };
}

/** Разбор действия кнопки в экран. Общий для всех каналов, кроме Telegram. */
export async function screenFor(
  db: Db,
  channel: ChannelId,
  externalId: string,
  displayName: string,
  action: string,
): Promise<Screen> {
  if (action === 'about') return aboutScreen(db);
  if (action === 't:list') return toursScreen(db);
  if (action === 'my:list') return bookingsScreen(db, channel, externalId, displayName);
  if (action === 'me') return cabinetScreen(db, channel, externalId, displayName);
  if (action.startsWith('t:')) return tourScreen(db, action.slice(2));
  return menuScreen(db);
}
