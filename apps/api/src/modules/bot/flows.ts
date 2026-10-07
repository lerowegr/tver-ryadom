import { botDrafts, bookings, favorites, schedules, tours, users, type Db } from '@tver/db';
import { bookingCreateSchema, escapeHtml, formatPrice } from '@tver/shared';
import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import { InlineKeyboard, Keyboard, type Context } from 'grammy';
import { toImageUrls } from '../../lib/images';
import { createBooking } from '../bookings/service';
import { formatMsk } from '../notifications/templates';
import { cabinetText, ensureAccount } from './cabinet';

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

/**
 * Что бот помнит про чат между сообщениями.
 *
 * Кроме недособранной брони здесь лежит признак «жду ответа на такое-то
 * поле кабинета»: без него присланный текст не отличить от вопроса
 * администратору.
 */
export interface BotState {
  booking?: Draft;
  awaiting?: 'name' | 'phone' | 'email' | 'photo';
}

export async function readState(db: Db, chatId: string): Promise<BotState> {
  const row = await db.query.botDrafts.findFirst({ where: eq(botDrafts.chatId, chatId) });
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.payload) as BotState & Draft;
    // Записи первой версии хранили бронь без обёртки — разбираем и такие.
    if ('tourId' in parsed && parsed.tourId) return { booking: parsed as Draft };
    return parsed;
  } catch {
    return {};
  }
}

export async function writeState(db: Db, chatId: string, state: BotState): Promise<void> {
  await db
    .insert(botDrafts)
    .values({ chatId, payload: JSON.stringify(state) })
    .onConflictDoUpdate({
      target: botDrafts.chatId,
      set: { payload: JSON.stringify(state), updatedAt: new Date() },
    });
}

async function readDraft(db: Db, chatId: string): Promise<Draft | null> {
  return (await readState(db, chatId)).booking ?? null;
}

async function writeDraft(db: Db, chatId: string, draft: Draft): Promise<void> {
  const state = await readState(db, chatId);
  await writeState(db, chatId, { ...state, booking: draft });
}

async function dropDraft(db: Db, chatId: string): Promise<void> {
  await db.delete(botDrafts).where(eq(botDrafts.chatId, chatId));
}

/* ============================================================
   Общие куски интерфейса
   ============================================================ */

/**
 * Мини-приложение открывается только по https: на http Telegram отвергает
 * всю клавиатуру, и сообщение не доходит вовсе. В разработке адрес
 * локальный, поэтому кнопки там просто нет.
 */
export function webAppUrl(siteUrl: string | undefined): string | null {
  return siteUrl && siteUrl.startsWith('https://') ? siteUrl : null;
}

export function mainMenu(admin = false, siteUrl?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text('🗺 Экскурсии', 't:list')
    .row()
    .text('📋 Мои брони', 'my:list')
    .text('👤 Кабинет', 'me')
    .row()
    .text('ℹ️ Про экскурсии', 'about');
  // Кнопка управления видна только администратору: остальным она
  // не нужна, а лишний ряд в меню только мешает.
  const app = webAppUrl(siteUrl);
  if (app) keyboard.row().webApp('📱 Открыть приложение', app);
  if (admin) keyboard.row().text('⚙️ Управление', 'a:home');
  return keyboard;
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

/* ============================================================
   Навигация без следа
   ============================================================ */

/**
 * Удаление текущего сообщения.
 *
 * Телеграм отказывает, если сообщение старше двух суток или у бота нет
 * прав. Это не повод ронять шаг — просто идём дальше.
 */
export async function safeDelete(ctx: Context): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch {
    /* сообщение уже удалено или слишком старое */
  }
}

/**
 * Показывает экран на месте текущего сообщения.
 *
 * Сначала пробуем заменить текст: тогда в переписке не копится лента из
 * промежуточных шагов. Если текущее сообщение — фотография, править её в
 * текст нельзя, поэтому удаляем и отправляем новое.
 */
async function show(ctx: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
    return;
  } catch {
    /* не текстовое сообщение или редактировать нечего */
  }
  await safeDelete(ctx);
  // Отдельным сообщением, а не заменой карточки: описание длинное и в
  // подпись под фото не поместится. Кнопка «Свернуть» это сообщение
  // удаляет, и карусель снова оказывается последней в переписке.
  await ctx.reply(text, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
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

/**
 * Карусель экскурсий: одна карточка на экране, листается стрелками.
 *
 * Раньше бот высыпал все карточки подряд — переписка забивалась, а вернуться
 * к первой можно было только прокруткой. Теперь карточка одна и заменяет
 * саму себя; список кольцевой, поэтому с последней стрелка ведёт к первой.
 */
export async function sendCarousel(
  ctx: Context,
  db: Db,
  imagesBase: string,
  index: number,
  replace: boolean,
  chatId?: string,
  siteUrl?: string,
): Promise<void> {
  const list = await publishedTours(db);
  if (list.length === 0) {
    await ctx.reply('Экскурсий пока нет — загляните позже.');
    return;
  }

  // Кольцо: с последней вперёд — на первую, с первой назад — на последнюю.
  const i = ((index % list.length) + list.length) % list.length;
  const tour = list[i]!;

  const caption = clamp(
    `<b>${escapeHtml(tour.title)}</b>
` +
      (tour.subtitle ? `<i>${escapeHtml(tour.subtitle)}</i>
` : '') +
      `
${escapeHtml(tour.shortDescription)}
` +
      `
💰 ${priceLine(tour.price, tour.priceType)}
⏱ ${hours(tour.durationMinutes)}`,
    1000,
  );

  // Сердечко показывает текущее состояние, а не действие: так понятнее,
  // добавлена уже экскурсия или нет.
  let liked = false;
  if (chatId) {
    const account = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatId),
      columns: { id: true },
    });
    if (account) {
      const row = await db.query.favorites.findFirst({
        where: and(eq(favorites.userId, account.id), eq(favorites.tourId, tour.id)),
      });
      liked = Boolean(row);
    }
  }

  const keyboard = new InlineKeyboard();
  if (list.length > 1) {
    keyboard
      .text('‹', `t:i:${i - 1}`)
      .text(`${i + 1} из ${list.length}`, 't:noop')
      .text('›', `t:i:${i + 1}`)
      .row();
  }
  keyboard
    .text('Подробнее', `t:${tour.id}`)
    .text('Забронировать', `b:go:${tour.id}`)
    .row()
    .text(liked ? '❤️ В избранном' : '🤍 В избранное', `fav:t:${tour.id}:${i}`)
    .row();
  const app = webAppUrl(siteUrl);
  if (app) keyboard.webApp('📱 Открыть в приложении', `${app}/excursions/${tour.slug}`).row();
  keyboard.text('← Меню', 'menu');

  const image = tour.images?.[0];
  const photo = image
    ? toImageUrls({ r2Key: image.r2Key, alt: image.alt, variants: image.variants }, imagesBase)
        .variants.card
    : null;

  if (replace) {
    // Замена картинки на месте — самый плавный вариант, но он возможен
    // только когда и текущая, и новая карточка с фотографией.
    if (photo) {
      try {
        await ctx.editMessageMedia(
          { type: 'photo', media: photo, caption, parse_mode: 'HTML' },
          { reply_markup: keyboard },
        );
        return;
      } catch {
        /* текущее сообщение без фото — удалим и отправим заново */
      }
    }
    await safeDelete(ctx);
  }

  if (photo) {
    try {
      await ctx.replyWithPhoto(photo, { caption, parse_mode: 'HTML', reply_markup: keyboard });
      return;
    } catch {
      /* фото недоступно — карточка всё равно должна дойти */
    }
  }
  await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
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

  // Индекс нужен, чтобы «Назад» вернуло к той же карточке, а не к первой.
  const list = await publishedTours(db);
  const index = Math.max(
    0,
    list.findIndex((t) => t.id === tour.id),
  );

  // Описание заменяет карточку, а не ложится под неё: на экране всегда
  // ровно одно сообщение, как в остальных шагах.
  await show(
    ctx,
    text,
    new InlineKeyboard()
      .text('Забронировать', `b:go:${tour.id}`)
      .row()
      .text('← Назад к карточке', `t:i:${index}`),
  );
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

  await show(ctx, `<b>${escapeHtml(tour.title)}</b>\n\nВыберите дату:`, keyboard);
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

  await show(ctx, 'На какой день?', keyboard);
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

  await show(ctx, 'Во сколько начнём?', keyboard);
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

  await show(ctx, 'Сколько человек пойдёт?', keyboard);
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

  await show(
    ctx,
    `<b>Проверьте заявку</b>\n\n` +
      `🌿 ${escapeHtml(tour.title)}\n` +
      `📅 ${when}\n` +
      `👥 ${people} чел.\n` +
      `💰 ${formatPrice(total)}\n\n` +
      `Это заявка, а не оплата: мы свяжемся и подтвердим.`,
    new InlineKeyboard().text('✅ Отправить заявку', 'b:ok').row().text('Отмена', 'b:x'),
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
          .text('Отменить бронь', `my:c:${b.id}`)
          .text('← Свернуть', 't:back'),
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

/* ============================================================
   Избранное
   ============================================================ */

/**
 * Переключатель сердечка.
 *
 * Аккаунт заводим на месте: человек мог прийти в бота, не заходя на сайт,
 * а избранное без учётной записи хранить негде.
 */
export async function toggleFavorite(
  db: Db,
  chatId: string,
  tourId: string,
  displayName: string,
): Promise<boolean> {
  const account = await ensureAccount(db, chatId, displayName);
  const existing = await db.query.favorites.findFirst({
    where: and(eq(favorites.userId, account.id), eq(favorites.tourId, tourId)),
  });

  if (existing) {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, account.id), eq(favorites.tourId, tourId)));
    return false;
  }
  await db.insert(favorites).values({ userId: account.id, tourId });
  return true;
}

export async function sendFavorites(
  ctx: Context,
  db: Db,
  chatId: string,
  displayName: string,
): Promise<void> {
  const account = await ensureAccount(db, chatId, displayName);
  const rows = await db
    .select({
      id: tours.id,
      title: tours.title,
      price: tours.price,
      priceType: tours.priceType,
      durationMinutes: tours.durationMinutes,
    })
    .from(favorites)
    .innerJoin(tours, eq(tours.id, favorites.tourId))
    .where(and(eq(favorites.userId, account.id), eq(tours.status, 'published')));

  if (rows.length === 0) {
    await show(
      ctx,
      '❤️ <b>Избранное</b>\n\nПока пусто. Открывайте карточку экскурсии и нажимайте сердечко — она появится здесь.',
      new InlineKeyboard().text('🗺 К экскурсиям', 't:list').row().text('← Меню', 'menu'),
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const row of rows) {
    keyboard.text(row.title, `t:${row.id}`).row();
  }
  keyboard.text('← Меню', 'menu');

  const lines = rows.map(
    (row) =>
      `• <b>${escapeHtml(row.title)}</b>\n  ${priceLine(row.price, row.priceType)} · ${hours(row.durationMinutes)}`,
  );

  await show(ctx, `❤️ <b>Избранное</b>\n\n${lines.join('\n')}`, keyboard);
}

/** Экран кабинета — здесь, чтобы переиспользовать замену сообщения. */
export async function sendCabinet(
  ctx: Context,
  db: Db,
  chatId: string,
  displayName: string,
): Promise<void> {
  const { text, keyboard } = await cabinetText(db, chatId, displayName);
  await show(ctx, text, keyboard);
}
