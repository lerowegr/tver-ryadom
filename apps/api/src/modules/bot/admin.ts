import { bookings, contactRequests, reviews, users, type Db } from '@tver/db';
import { formatPrice } from '@tver/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { InlineKeyboard, type Context } from 'grammy';
import { changeBookingStatus } from '../admin/booking-status';
import { recalcTourRating } from '../admin/reviews';
import { loadRange } from '../calendar/service';
import { formatMsk } from '../notifications/templates';
import { escapeHtml } from './screens';

/**
 * Админка в боте.
 *
 * Здесь то, что действительно удобно делать с телефона: разобрать заявки,
 * ответить на обращения, посмотреть день. Правку текстов и фотографий
 * экскурсий сюда не тащим — набирать описание на две тысячи знаков в
 * мессенджере мучительно, для этого есть веб-админка и мини-приложение.
 *
 * Все действия идут через те же службы, что и веб-админка: правила
 * перехода статусов, возврат мест в слот и уведомления там уже описаны.
 */

export async function isAdmin(db: Db, chatId: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: and(eq(users.telegramChatId, chatId), eq(users.role, 'admin')),
    columns: { id: true },
  });
  return Boolean(row);
}

async function replace(ctx: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
    return;
  } catch {
    /* сообщение с фотографией либо уже удалено */
  }
  try {
    await ctx.deleteMessage();
  } catch {
    /* слишком старое */
  }
  await ctx.reply(text, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}

/** Сводка: сколько всего ждёт руки администратора. */
export async function sendAdminHome(ctx: Context, db: Db): Promise<void> {
  const [pendingBookings] = await db
    .select({ total: count() })
    .from(bookings)
    .where(eq(bookings.status, 'pending'));
  const [pendingReviews] = await db
    .select({ total: count() })
    .from(reviews)
    .where(eq(reviews.status, 'pending'));
  const [newRequests] = await db
    .select({ total: count() })
    .from(contactRequests)
    .where(eq(contactRequests.status, 'new'));

  const text = [
    '<b>Управление</b>',
    '',
    `Заявок ждёт ответа: <b>${pendingBookings?.total ?? 0}</b>`,
    `Отзывов на модерации: <b>${pendingReviews?.total ?? 0}</b>`,
    `Обращений с сайта: <b>${newRequests?.total ?? 0}</b>`,
  ].join('\n');

  await replace(
    ctx,
    text,
    new InlineKeyboard()
      .text('Заявки', 'a:bk')
      .text('Сегодня', 'a:day')
      .row()
      .text('Отзывы', 'a:rv')
      .text('Обращения', 'a:rq')
      .row()
      .text('К меню', 'menu'),
  );
}

/** Заявки, ожидающие подтверждения. */
export async function sendPendingBookings(ctx: Context, db: Db): Promise<void> {
  const rows = await db.query.bookings.findMany({
    where: eq(bookings.status, 'pending'),
    with: { tour: { columns: { title: true } }, schedule: { columns: { startsAt: true } } },
    orderBy: [desc(bookings.createdAt)],
    limit: 8,
  });

  if (rows.length === 0) {
    await replace(
      ctx,
      '<b>Заявки</b>\n\nНеразобранных нет — всё подтверждено.',
      new InlineKeyboard().text('К управлению', 'a:home'),
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = rows.map((b, i) => {
    const when = b.schedule?.startsAt ?? b.desiredDate;
    keyboard.text(`Принять ${i + 1}`, `a:bk:ok:${b.id}`).text(`Отклонить ${i + 1}`, `a:bk:no:${b.id}`).row();
    return (
      `<b>${i + 1}. ${escapeHtml(b.tour?.title ?? 'Экскурсия')}</b>\n` +
      `${when ? formatMsk(when) : 'дата на согласовании'} · ${b.peopleCount} чел. · ${formatPrice(b.totalPrice)}\n` +
      `${escapeHtml(b.contactName)}, ${escapeHtml(b.contactPhone)}` +
      (b.comment ? `\n<i>${escapeHtml(b.comment)}</i>` : '')
    );
  });
  keyboard.text('К управлению', 'a:home');

  await replace(ctx, `<b>Заявки</b>\n\n${lines.join('\n\n')}`, keyboard);
}

export async function decideBooking(
  ctx: Context,
  db: Db,
  bookingId: string,
  confirm: boolean,
  siteUrl: string,
): Promise<void> {
  try {
    await changeBookingStatus(
      db,
      bookingId,
      confirm ? 'confirmed' : 'cancelled',
      confirm ? undefined : 'Отменено администратором',
      siteUrl,
    );
    await ctx.answerCallbackQuery(confirm ? 'Подтверждено' : 'Отменено');
  } catch (error) {
    await ctx.answerCallbackQuery(error instanceof Error ? error.message.slice(0, 190) : 'Ошибка');
  }
  await sendPendingBookings(ctx, db);
}

/** Отзывы на модерации. */
export async function sendPendingReviews(ctx: Context, db: Db): Promise<void> {
  const rows = await db.query.reviews.findMany({
    where: eq(reviews.status, 'pending'),
    with: { tour: { columns: { title: true } } },
    orderBy: [desc(reviews.createdAt)],
    limit: 5,
  });

  if (rows.length === 0) {
    await replace(
      ctx,
      '<b>Отзывы</b>\n\nНа модерации пусто.',
      new InlineKeyboard().text('К управлению', 'a:home'),
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = rows.map((r, i) => {
    keyboard.text(`Опубликовать ${i + 1}`, `a:rv:ok:${r.id}`).text(`Отклонить ${i + 1}`, `a:rv:no:${r.id}`).row();
    return (
      `<b>${i + 1}. ${escapeHtml(r.authorName)}</b> · ${r.rating} из 5\n` +
      `${escapeHtml(r.tour?.title ?? '')}\n<i>${escapeHtml(r.text.slice(0, 400))}</i>`
    );
  });
  keyboard.text('К управлению', 'a:home');

  await replace(ctx, `<b>Отзывы</b>\n\n${lines.join('\n\n')}`, keyboard);
}

export async function decideReview(
  ctx: Context,
  db: Db,
  reviewId: string,
  approve: boolean,
): Promise<void> {
  const review = await db.query.reviews.findFirst({
    where: eq(reviews.id, reviewId),
    columns: { id: true, tourId: true },
  });
  if (!review) {
    await ctx.answerCallbackQuery('Отзыв не найден');
    return;
  }
  await db
    .update(reviews)
    .set({ status: approve ? 'approved' : 'rejected' })
    .where(eq(reviews.id, reviewId));
  // Рейтинг считается только по одобренным — пересчитываем в обе стороны.
  await recalcTourRating(db, review.tourId);
  await ctx.answerCallbackQuery(approve ? 'Опубликован' : 'Отклонён');
  await sendPendingReviews(ctx, db);
}

/** Обращения с формы обратной связи. */
export async function sendRequests(ctx: Context, db: Db): Promise<void> {
  const rows = await db.query.contactRequests.findMany({
    where: eq(contactRequests.status, 'new'),
    orderBy: [desc(contactRequests.createdAt)],
    limit: 5,
  });

  if (rows.length === 0) {
    await replace(
      ctx,
      '<b>Обращения</b>\n\nНовых нет.',
      new InlineKeyboard().text('К управлению', 'a:home'),
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = rows.map((r, i) => {
    keyboard.text(`Отметить ${i + 1}`, `a:rq:ok:${r.id}`).row();
    return (
      `<b>${i + 1}. ${escapeHtml(r.name)}</b>` +
      (r.phone ? ` · ${escapeHtml(r.phone)}` : '') +
      (r.email ? ` · ${escapeHtml(r.email)}` : '') +
      `\n<i>${escapeHtml(r.message.slice(0, 500))}</i>`
    );
  });
  keyboard.text('К управлению', 'a:home');

  await replace(ctx, `<b>Обращения</b>\n\n${lines.join('\n\n')}`, keyboard);
}

export async function markRequest(ctx: Context, db: Db, requestId: string): Promise<void> {
  await db
    .update(contactRequests)
    .set({ status: 'processed' })
    .where(eq(contactRequests.id, requestId));
  await ctx.answerCallbackQuery('Отмечено');
  await sendRequests(ctx, db);
}

/** Занятость на сегодня — тем же запросом, что и календарь в админке. */
export async function sendToday(ctx: Context, db: Db): Promise<void> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime() + 86_400_000 - 1);
  const entries = await loadRange(db, from, to);

  const text =
    entries.length === 0
      ? '<b>Сегодня</b>\n\nНичего не назначено.'
      : '<b>Сегодня</b>\n\n' +
        entries
          .map((entry) => {
            const head = `${formatMsk(entry.startsAt)} — ${escapeHtml(entry.tourTitle)}`;
            if (entry.kind === 'slot') {
              const guests = entry.guests.length
                ? entry.guests
                    .map((g) => `  ${escapeHtml(g.name)}, ${g.people} чел., ${escapeHtml(g.phone)}`)
                    .join('\n')
                : '  записей нет';
              return `${head}\n  ${entry.booked}/${entry.capacity} мест\n${guests}`;
            }
            return `${head}\n  заявка: ${escapeHtml(entry.contactName)}, ${entry.people} чел., ${escapeHtml(entry.contactPhone)}`;
          })
          .join('\n\n');

  await replace(ctx, text, new InlineKeyboard().text('К управлению', 'a:home'));
}
