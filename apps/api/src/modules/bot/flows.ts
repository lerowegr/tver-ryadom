import { botDrafts, bookings, schedules, tours, users, type Db } from '@tver/db';
import { bookingCreateSchema, formatPrice } from '@tver/shared';
import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import { InlineKeyboard, Keyboard, type Context } from 'grammy';
import { toImageUrls } from '../../lib/images';
import { createBooking } from '../bookings/service';
import { formatMsk } from '../notifications/templates';

/**
 * Экраны бота: карточки экскурсий и бронирование в несколько нажатий.
 *
 * Состояние шага живёт в таблице черновиков, а не в callback_data: у неё
 * потолок 64 байта, а один идентификатор слота занимает 36 символов.
 * Черновик один на чат — параллельных броней у человека не бывает.
 */

interface Draft {
  tourId: string;
  scheduleId?: string;
  desiredDate?: string;
  people?: number;
}

/** Время начала для заявок на свою дату. */
const TIMES = ['10:00', '12:00', '14:00', '16:00', '18:00'];
/** На сколько дней вперёд предлагаем свою дату. */
const DAYS_AHEAD = 14;

const dayLabel = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Moscow',
});

/* ============================================================
   Черновик
   ============================================================ */

async function readDraft(db: Db, chatId: string): Promise<Draft | null> {
  const row = await db.query.botDrafts.findFirst({ where: eq(botDrafts.chatId, chatId) });
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as Draft;
  } catch {
    return null;
  }
}

async function writeDraft(db: Db, chatId: string, draft: Draft): Promise<void> {
  await db
    .insert(botDrafts)
    .values({ chatId, payload: JSON.stringify(draft) })
    .onConflictDoUpdate({
      target: botDrafts.chatId,
      set: { payload: JSON.stringify(draft), updatedAt: new Date() },
    });
}

async function dropDraft(db: Db, chatId: string): Promise<void> {
  await db.delete(botDrafts).where(eq(botDrafts.chatId, chatId));
}

/* ============================================================
   Общие куски интерфейса
   ============================================================ */

export function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🗺 Экскурсии', 't:list')
    .row()
    .text('📋 Мои брони', 'my:list')
    .row()
    .text('ℹ️ Как это работает', 'help');
}

function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} ч`.replace('.', ',');
}

function priceLine(price: number, priceType: string): string {
  return `${formatPrice(price)} ${priceType === 'per_person' ? 'за человека' : 'за группу'}`;
}

/** Телеграм не даёт подписи под фото длиннее 1024 символов. */
function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).trimEnd() + '…';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   Экскурсии
   ============================================================ */

async function publishedTours(db: Db) {
  return db.query.tours.findMany({
    where: eq(tours.status, 'published'),
    orderBy: (t, { asc: byAsc }) => [byAsc(t.sortOrder)],
    with: { images: { orderBy: (i, { asc: byAsc }) => [byAsc(i.sortOrder)], limit: 1 } },
  });
}

/** Карточка: фото, короткое описание и две кнопки. */
export async function sendTourCards(ctx: Context, db: Db, imagesBase: string): Promise<void> {
  const list = await publishedTours(db);
  if (list.length === 0) {
    await ctx.reply('Экскурсий пока нет — загляните позже.');
    return;
  }

  for (const tour of list) {
    const caption = clamp(
      `<b>${escapeHtml(tour.title)}</b>\n` +
        (tour.subtitle ? `<i>${escapeHtml(tour.subtitle)}</i>\n` : '') +
        `\n${escapeHtml(tour.shortDescription)}\n` +
        `\n💰 ${priceLine(tour.price, tour.priceType)}\n⏱ ${hours(tour.durationMinutes)}`,
      1000,
    );
    const keyboard = new InlineKeyboard()
      .text('Подробнее', `t:${tour.id}`)
      .text('Забронировать', `b:go:${tour.id}`);

    const image = tour.images?.[0];
    const photo = image
      ? toImageUrls({ r2Key: image.r2Key, alt: image.alt, variants: image.variants }, imagesBase)
          .variants.card
      : null;

    // Фото может не загрузиться (битая ссылка, недоступный бакет) — тогда
    // карточка всё равно должна дойти, просто текстом.
    if (photo) {
      try {
        await ctx.replyWithPhoto(photo, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        continue;
      } catch {
        /* падаем в текстовый вариант ниже */
      }
    }
    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

export async function sendTourDetails(ctx: Context, db: Db, tourId: string): Promise<void> {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.id, tourId), eq(tours.status, 'published')),
    with: { routePoints: { orderBy: (p, { asc: byAsc }) => [byAsc(p.sortOrder)] } },
  });
  if (!tour) {
    await ctx.reply('Экскурсия не найдена.');
    return;
  }

  const route = tour.routePoints?.length
    ? '\n\n<b>Маршрут</b>\n' +
      tour.routePoints.map((p, i) => `${i + 1}. ${escapeHtml(p.title)}`).join('\n')
    : '';

  const text = clamp(
    `<b>${escapeHtml(tour.title)}</b>\n\n${escapeHtml(tour.fullDescription)}` +
      route +
      `\n\n💰 ${priceLine(tour.price, tour.priceType)}\n⏱ ${hours(tour.durationMinutes)}` +
      (tour.meetingPoint ? `\n📍 ${escapeHtml(tour.meetingPoint)}` : ''),
    3800,
  );

  await ctx.reply(text, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: new InlineKeyboard()
      .text('Забронировать', `b:go:${tour.id}`)
      .row()
      .text('← К списку', 't:list'),
  });
}

/* ============================================================
   Бронирование
   ============================================================ */

/** Шаг 1: выбор даты — слоты расписания либо своя дата. */
export async function startBooking(ctx: Context, db: Db, chatId: string, tourId: string) {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.id, tourId), eq(tours.status, 'published')),
  });
  if (!tour) {
    await ctx.reply('Экскурсия не найдена.');
    return;
  }

  await writeDraft(db, chatId, { tourId });

  const slots = await db.query.schedules.findMany({
    where: and(
      eq(schedules.tourId, tourId),
      eq(schedules.status, 'open'),
      gt(schedules.startsAt, new Date()),
    ),
    orderBy: [asc(schedules.startsAt)],
    limit: 6,
  });

  const keyboard = new InlineKeyboard();
  for (const slot of slots) {
    const free = slot.capacity - slot.bookedCount;
    if (free <= 0) continue;
    keyboard.text(`${formatMsk(slot.startsAt)} · свободно ${free}`, `b:s:${slot.id}`).row();
  }
  keyboard.text('📅 Другая дата', 'b:days').row().text('Отмена', 'b:x');

  await ctx.reply(
    `<b>${escapeHtml(tour.title)}</b>\n\nВыберите дату:`,
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
}

/** Шаг 1б: календарь на две недели вперёд. */
export async function askDay(ctx: Context, db: Db, chatId: string) {
  const draft = await readDraft(db, chatId);
  if (!draft) return void ctx.reply('Начните заново: /tours');

  const keyboard = new InlineKeyboard();
  const now = new Date();
  for (let i = 1; i <= DAYS_AHEAD; i += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    keyboard.text(dayLabel.format(day), `b:d:${key}`);
    if (i % 3 === 0) keyboard.row();
  }
  keyboard.row().text('Отмена', 'b:x');

  await ctx.reply('На какой день?', { reply_markup: keyboard });
}

export async function askTime(ctx: Context, db: Db, chatId: string, day: string) {
  const draft = await readDraft(db, chatId);
  if (!draft) return void ctx.reply('Начните заново: /tours');
  await writeDraft(db, chatId, { ...draft, desiredDate: day, scheduleId: undefined });

  const keyboard = new InlineKeyboard();
  TIMES.forEach((time, i) => {
    keyboard.text(time, `b:h:${time}`);
    if ((i + 1) % 3 === 0) keyboard.row();
  });
  keyboard.row().text('Отмена', 'b:x');

  await ctx.reply('Во сколько начнём?', { reply_markup: keyboard });
}

/** Шаг 2: число участников. */
export async function askPeople(ctx: Context, db: Db, chatId: string, patch: Partial<Draft>) {
  const draft = await readDraft(db, chatId);
  if (!draft) return void ctx.reply('Начните заново: /tours');
  const next = { ...draft, ...patch };
  await writeDraft(db, chatId, next);

  const tour = await db.query.tours.findFirst({ where: eq(tours.id, next.tourId) });
  if (!tour) return void ctx.reply('Экскурсия не найдена.');

  const min = tour.groupMin;
  const max = Math.min(tour.groupMax ?? 10, min + 11);
  const keyboard = new InlineKeyboard();
  let placed = 0;
  for (let n = min; n <= max; n += 1) {
    keyboard.text(String(n), `b:p:${n}`);
    placed += 1;
    if (placed % 4 === 0) keyboard.row();
  }
  keyboard.row().text('Отмена', 'b:x');

  await ctx.reply('Сколько человек пойдёт?', { reply_markup: keyboard });
}

/** Шаг 3: показать итог и попросить подтверждение. */
export async function askConfirm(ctx: Context, db: Db, chatId: string, people: number) {
  const draft = await readDraft(db, chatId);
  if (!draft) return void ctx.reply('Начните заново: /tours');
  const next = { ...draft, people };
  await writeDraft(db, chatId, next);

  const tour = await db.query.tours.findFirst({ where: eq(tours.id, next.tourId) });
  if (!tour) return void ctx.reply('Экскурсия не найдена.');

  const when = await describeWhen(db, next);
  const total = tour.priceType === 'per_person' ? tour.price * people : tour.price;

  await ctx.reply(
    `<b>Проверьте заявку</b>\n\n` +
      `🌿 ${escapeHtml(tour.title)}\n` +
      `📅 ${when}\n` +
      `👥 ${people} чел.\n` +
      `💰 ${formatPrice(total)}\n\n` +
      `Это заявка, а не оплата: мы свяжемся и подтвердим.`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('✅ Отправить заявку', 'b:ok')
        .row()
        .text('Отмена', 'b:x'),
    },
  );
}

async function describeWhen(db: Db, draft: Draft): Promise<string> {
  if (draft.scheduleId) {
    const slot = await db.query.schedules.findFirst({
      where: eq(schedules.id, draft.scheduleId),
    });
    return slot ? formatMsk(slot.startsAt) : 'дата уточняется';
  }
  if (draft.desiredDate) {
    return `${formatMsk(new Date(draft.desiredDate))} (дата на согласовании)`;
  }
  return 'дата уточняется';
}

/**
 * Шаг 4: создание брони.
 *
 * Телефон обязателен, а в Telegram его нет: если аккаунт не привязан или
 * номер не сохранён, просим поделиться контактом одной кнопкой — вводить
 * цифры руками в мессенджере мучительно.
 */
export async function confirmBooking(
  ctx: Context,
  db: Db,
  chatId: string,
  siteUrl: string,
): Promise<void> {
  const draft = await readDraft(db, chatId);
  if (!draft?.people) return void ctx.reply('Заявка устарела. Начните заново: /tours');

  const account = await db.query.users.findFirst({ where: eq(users.telegramChatId, chatId) });

  if (!account?.phone) {
    await ctx.reply(
      'Остался телефон — по нему мы подтвердим бронь.\n\nНажмите кнопку ниже: номер придёт из Telegram, вводить руками не нужно.',
      {
        reply_markup: new Keyboard()
          .requestContact('📱 Поделиться номером')
          .resized()
          .oneTime(),
      },
    );
    return;
  }

  await placeBooking(ctx, db, chatId, draft, account.name, account.phone, account.id, siteUrl);
}

/** Общая часть: создаёт бронь и отвечает человеку. */
export async function placeBooking(
  ctx: Context,
  db: Db,
  chatId: string,
  draft: Draft,
  name: string,
  phone: string,
  userId: string | undefined,
  siteUrl: string,
): Promise<void> {
  if (!draft.people) return;

  // Тот же разбор, что и на сайте: он нормализует телефон к +7XXXXXXXXXX и
  // ловит нероссийские номера. Вызывать службу в обход схемы нельзя —
  // правила у сайта и бота разъедутся.
  const parsed = bookingCreateSchema.safeParse({
    tourId: draft.tourId,
    scheduleId: draft.scheduleId,
    desiredDate: draft.desiredDate ? new Date(draft.desiredDate) : undefined,
    peopleCount: draft.people,
    contactName: name,
    contactPhone: phone,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Проверьте данные';
    await ctx.reply(
      `Не получилось: ${first}.

Если номер не российский, напишите его сюда сообщением — оформим вручную.`,
    );
    return;
  }

  try {
    const booking = await createBooking(
      db,
      parsed.data,
      userId ? { id: userId, role: 'user', sessionId: 'telegram' } : undefined,
      siteUrl,
      'telegram',
    );
    await dropDraft(db, chatId);

    await ctx.reply(
      `✅ <b>Заявка отправлена!</b>\n\n` +
        `${escapeHtml(booking.tour?.title ?? 'Экскурсия')}\n` +
        `${booking.startsAt ? formatMsk(booking.startsAt) : 'дата на согласовании'} · ${draft.people} чел.\n` +
        `К оплате: ${formatPrice(booking.totalPrice)}\n\n` +
        `Мы свяжемся для подтверждения. Напомним за сутки до начала.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('📋 Мои брони', 'my:list'),
      },
    );
  } catch (error) {
    await dropDraft(db, chatId);
    const message = error instanceof Error ? error.message : 'Не удалось оформить заявку';
    await ctx.reply(`Не получилось: ${message}\n\nПопробуйте ещё раз: /tours`);
  }
}

export { readDraft, dropDraft };

/* ============================================================
   Мои брони
   ============================================================ */

export async function sendMyBookings(ctx: Context, db: Db, chatId: string, siteUrl: string) {
  const account = await db.query.users.findFirst({
    where: eq(users.telegramChatId, chatId),
    columns: { id: true },
  });
  if (!account) {
    await ctx.reply(
      `Аккаунт не привязан. Откройте ${siteUrl}/account и нажмите «Привязать Telegram» — тогда брони с сайта будут видны и здесь.`,
    );
    return;
  }

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

  const upcoming = found
    .map((b) => ({ ...b, when: b.schedule?.startsAt ?? b.desiredDate ?? null }))
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0))
    .slice(0, 10);

  if (upcoming.length === 0) {
    await ctx.reply('Предстоящих экскурсий нет.', {
      reply_markup: new InlineKeyboard().text('🗺 Выбрать экскурсию', 't:list'),
    });
    return;
  }

  for (const b of upcoming) {
    const when = b.when
      ? `${formatMsk(b.when)}${b.schedule ? '' : ' (дата на согласовании)'}`
      : 'дата согласовывается';
    const mark = b.status === 'confirmed' ? '✅' : '🕐';

    await ctx.reply(
      `${mark} <b>${escapeHtml(b.tour?.title ?? 'Экскурсия')}</b>\n` +
        `${when} · ${b.peopleCount} чел. · ${formatPrice(b.totalPrice)}\n` +
        `Напоминание за сутки: ${b.reminderOff ? 'выключено' : 'включено'}`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text(b.reminderOff ? '🔔 Включить напоминание' : '🔕 Выключить напоминание', `my:r:${b.id}`)
          .row()
          .text('Отменить бронь', `my:c:${b.id}`),
      },
    );
  }
}

/** Переключатель напоминания по конкретной брони. */
export async function toggleReminder(ctx: Context, db: Db, chatId: string, bookingId: string) {
  const account = await db.query.users.findFirst({
    where: eq(users.telegramChatId, chatId),
    columns: { id: true },
  });
  if (!account) return void ctx.answerCallbackQuery('Аккаунт не привязан');

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, account.id)),
    columns: { id: true, reminderOff: true },
  });
  if (!booking) return void ctx.answerCallbackQuery('Бронь не найдена');

  const next = !booking.reminderOff;
  await db.update(bookings).set({ reminderOff: next }).where(eq(bookings.id, bookingId));
  await ctx.answerCallbackQuery(next ? 'Напоминание выключено' : 'Напомним за сутки');
}
