import type { Db } from '@tver/db';
import { users } from '@tver/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { Bot, type Context } from 'grammy';
import type { Bindings } from '../../env';
import { verifyLinkCode } from '../../lib/tg-link';
import { PROMPTS, applyEdit, saveAvatar, type Awaiting } from './cabinet';
import {
  askConfirm,
  askDay,
  askPeople,
  askTime,
  confirmBooking,
  dropDraft,
  mainMenu,
  placeBooking,
  readState,
  safeDelete,
  sendCabinet,
  sendCarousel,
  sendFavorites,
  sendMyBookings,
  sendTourDetails,
  startBooking,
  toggleFavorite,
  toggleReminder,
  writeState,
} from './flows';
import { sendAbout, welcomeText } from './screens';
import {
  decideBooking,
  decideReview,
  isAdmin,
  markRequest,
  sendAdminHome,
  sendPendingBookings,
  sendPendingReviews,
  sendRequests,
  sendToday,
} from './admin';

interface DbRef {
  db: Db;
}

/** Москва круглый год на UTC+3, перевода часов нет. */
const MSK_OFFSET = '+03:00';

/** Имя из профиля Telegram — им подписываем впервые заведённый аккаунт. */
function displayName(ctx: Context): string {
  return (
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').trim() ||
    ctx.from?.username ||
    'Гость'
  );
}

function chat(ctx: Context): string {
  return String(ctx.chat?.id);
}

export function buildBot(env: Bindings, ref: DbRef): Bot {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const token = env.TELEGRAM_BOT_TOKEN;
  const siteUrl = env.SITE_URL ?? 'http://localhost:3000';
  const imagesBase = (env.IMAGES_BASE_URL ?? `${siteUrl}/images`).replace(/\/$/, '');

  const greet = async (ctx: Context, replace: boolean) => {
    const text = await welcomeText(ref.db);
    const admin = await isAdmin(ref.db, chat(ctx));
    if (replace) await safeDelete(ctx);
    await ctx.reply(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: mainMenu(admin, siteUrl),
    });
  };

  /**
   * Обёртка администраторских кнопок.
   *
   * Проверяем роль на каждое нажатие, а не один раз при показе меню:
   * идентификатор кнопки виден в переписке, и подобрать его несложно.
   */
  const onlyAdmin = (handler: (ctx: Context) => Promise<void>) => async (ctx: Context) => {
    if (!(await isAdmin(ref.db, chat(ctx)))) {
      await ctx.answerCallbackQuery('Раздел доступен только администратору');
      return;
    }
    await handler(ctx);
  };

  /* ── Команды ────────────────────────────────────────────── */

  bot.command('start', async (ctx) => {
    const code = ctx.match?.trim();
    if (code) {
      const userId = await verifyLinkCode(env.JWT_SECRET, code);
      if (!userId) {
        await ctx.reply('Ссылка привязки устарела. Откройте личный кабинет и попробуйте снова.');
        return;
      }
      const db = ref.db;
      const chatId = chat(ctx);
      // Один Telegram — один аккаунт: отвязываем чат от прежних пользователей.
      await db.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
      await db
        .update(users)
        .set({ telegramChatId: chatId, updatedAt: new Date() })
        .where(eq(users.id, userId));
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { name: true },
      });
      await ctx.reply(
        `✅ Готово, ${user?.name ?? 'друг'}! Аккаунт привязан.\n\nТеперь брони с сайта видны здесь, а подтверждения и напоминания приходят сюда.`,
        { reply_markup: mainMenu(false, siteUrl) },
      );
      return;
    }
    await greet(ctx, false);
  });

  bot.command(['menu', 'help'], (ctx) => greet(ctx, false));
  bot.command('tours', (ctx) => sendCarousel(ctx, ref.db, imagesBase, 0, false, chat(ctx), siteUrl));
  bot.command('mybookings', (ctx) => sendMyBookings(ctx, ref.db, chat(ctx), siteUrl));
  bot.command('me', (ctx) => sendCabinet(ctx, ref.db, chat(ctx), displayName(ctx)));
  bot.command('favorites', (ctx) => sendFavorites(ctx, ref.db, chat(ctx), displayName(ctx)));

  /* ── Меню и содержательные экраны ───────────────────────── */

  bot.callbackQuery('menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await greet(ctx, true);
  });

  bot.callbackQuery('about', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendAbout(ctx, ref.db);
  });

  bot.callbackQuery('me', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendCabinet(ctx, ref.db, chat(ctx), displayName(ctx));
  });

  bot.callbackQuery(/^me:e:(name|phone|email|photo)$/, async (ctx) => {
    const field = ctx.match[1] as Awaiting;
    await ctx.answerCallbackQuery();
    const state = await readState(ref.db, chat(ctx));
    await writeState(ref.db, chat(ctx), { ...state, awaiting: field });
    await ctx.reply(`${PROMPTS[field]}\n\nЧтобы передумать — отправьте /me`);
  });

  /* ── Управление ─────────────────────────────────────────── */

  bot.command('admin', async (ctx) => {
    if (!(await isAdmin(ref.db, chat(ctx)))) return;
    await sendAdminHome(ctx, ref.db);
  });

  bot.callbackQuery(
    'a:home',
    onlyAdmin(async (ctx) => {
      await ctx.answerCallbackQuery();
      await sendAdminHome(ctx, ref.db);
    }),
  );

  bot.callbackQuery(
    'a:bk',
    onlyAdmin(async (ctx) => {
      await ctx.answerCallbackQuery();
      await sendPendingBookings(ctx, ref.db);
    }),
  );

  bot.callbackQuery(
    'a:rv',
    onlyAdmin(async (ctx) => {
      await ctx.answerCallbackQuery();
      await sendPendingReviews(ctx, ref.db);
    }),
  );

  bot.callbackQuery(
    'a:rq',
    onlyAdmin(async (ctx) => {
      await ctx.answerCallbackQuery();
      await sendRequests(ctx, ref.db);
    }),
  );

  bot.callbackQuery(
    'a:day',
    onlyAdmin(async (ctx) => {
      await ctx.answerCallbackQuery();
      await sendToday(ctx, ref.db);
    }),
  );

  bot.callbackQuery(
    /^a:bk:(ok|no):(.+)$/,
    onlyAdmin(async (ctx) => {
      const match = ctx.callbackQuery?.data?.match(/^a:bk:(ok|no):(.+)$/);
      if (!match) return;
      await decideBooking(ctx, ref.db, match[2]!, match[1] === 'ok', siteUrl);
    }),
  );

  bot.callbackQuery(
    /^a:rv:(ok|no):(.+)$/,
    onlyAdmin(async (ctx) => {
      const match = ctx.callbackQuery?.data?.match(/^a:rv:(ok|no):(.+)$/);
      if (!match) return;
      await decideReview(ctx, ref.db, match[2]!, match[1] === 'ok');
    }),
  );

  bot.callbackQuery(
    /^a:rq:ok:(.+)$/,
    onlyAdmin(async (ctx) => {
      const match = ctx.callbackQuery?.data?.match(/^a:rq:ok:(.+)$/);
      if (!match) return;
      await markRequest(ctx, ref.db, match[1]!);
    }),
  );

  /* ── Экскурсии ──────────────────────────────────────────── */

  bot.callbackQuery('t:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendCarousel(ctx, ref.db, imagesBase, 0, false, chat(ctx), siteUrl);
  });

  // Счётчик «2 из 3» — не кнопка, но нажать её можно: гасим часики.
  bot.callbackQuery('t:noop', (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery('t:back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await safeDelete(ctx);
  });

  bot.callbackQuery(/^t:i:(-?\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendCarousel(ctx, ref.db, imagesBase, Number(ctx.match[1]), true, chat(ctx), siteUrl);
  });

  bot.callbackQuery(/^t:(?!list$|noop$|back$|i:)(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendTourDetails(ctx, ref.db, ctx.match[1]!);
  });

  /* ── Избранное ──────────────────────────────────────────── */

  bot.callbackQuery('fav:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendFavorites(ctx, ref.db, chat(ctx), displayName(ctx));
  });

  bot.callbackQuery(/^fav:t:(.+):(\d+)$/, async (ctx) => {
    const added = await toggleFavorite(ref.db, chat(ctx), ctx.match[1]!, displayName(ctx));
    await ctx.answerCallbackQuery(added ? 'Добавлено в избранное' : 'Убрано из избранного');
    // Перерисовываем ту же карточку, чтобы сердечко сменилось на месте.
    await sendCarousel(ctx, ref.db, imagesBase, Number(ctx.match[2]), true, chat(ctx), siteUrl);
  });

  /* ── Бронирование ───────────────────────────────────────── */

  bot.callbackQuery(/^b:go:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await startBooking(ctx, ref.db, chat(ctx), ctx.match[1]!);
  });

  bot.callbackQuery('b:days', async (ctx) => {
    await ctx.answerCallbackQuery();
    await askDay(ctx, ref.db, chat(ctx));
  });

  bot.callbackQuery(/^b:s:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askPeople(ctx, ref.db, chat(ctx), {
      scheduleId: ctx.match[1]!,
      desiredDate: undefined,
    });
  });

  bot.callbackQuery(/^b:d:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askTime(ctx, ref.db, chat(ctx), ctx.match[1]!);
  });

  bot.callbackQuery(/^b:h:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = chat(ctx);
    const draft = (await readState(ref.db, chatId)).booking;
    if (!draft?.desiredDate) return void ctx.reply('Начните заново: /tours');
    // Пояс указываем явно: воркер живёт по UTC и «10:00» без смещения понял
    // бы как десять утра по Гринвичу, то есть час дня по Москве.
    await askPeople(ctx, ref.db, chatId, {
      desiredDate: `${draft.desiredDate.slice(0, 10)}T${ctx.match[1]}:00${MSK_OFFSET}`,
    });
  });

  bot.callbackQuery(/^b:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askConfirm(ctx, ref.db, chat(ctx), Number(ctx.match[1]));
  });

  bot.callbackQuery('b:ok', async (ctx) => {
    await ctx.answerCallbackQuery();
    await confirmBooking(ctx, ref.db, chat(ctx), siteUrl);
  });

  bot.callbackQuery('b:x', async (ctx) => {
    await ctx.answerCallbackQuery('Отменено');
    await dropDraft(ref.db, chat(ctx));
    // Возвращаем туда, откуда пришли: карточка вместо тупика с меню.
    await sendCarousel(ctx, ref.db, imagesBase, 0, true, chat(ctx), siteUrl);
  });

  /* ── Брони ──────────────────────────────────────────────── */

  bot.callbackQuery('my:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMyBookings(ctx, ref.db, chat(ctx), siteUrl);
  });

  bot.callbackQuery(/^my:r:(.+)$/, (ctx) => toggleReminder(ctx, ref.db, chat(ctx), ctx.match[1]!));

  bot.callbackQuery(/^my:c:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Отмену брони делаем вручную, чтобы ничего не потерялось: напишите сюда причину — я передам администратору. Либо отмените в кабинете: ${siteUrl}/account/bookings`,
    );
  });

  /* ── Контакт: телефон для брони либо для кабинета ───────── */

  bot.on('message:contact', async (ctx) => {
    const db = ref.db;
    const chatId = chat(ctx);
    const state = await readState(db, chatId);
    const contact = ctx.message.contact;

    // Чужой контакт не подходит: и бронь, и кабинет — про самого человека.
    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply('Нужен ваш собственный номер — нажмите кнопку ещё раз.');
      return;
    }

    if (state.awaiting === 'phone') {
      const result = await applyEdit(db, chatId, 'phone', contact.phone_number, displayName(ctx));
      await writeState(db, chatId, { ...state, awaiting: undefined });
      await ctx.reply(result.message, { reply_markup: { remove_keyboard: true } });
      await sendCabinet(ctx, db, chatId, displayName(ctx));
      return;
    }

    if (!state.booking?.people) {
      await ctx.reply('Спасибо! Номер пригодится, когда будете бронировать.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const name =
      [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || displayName(ctx);

    const account = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatId),
      columns: { id: true },
    });

    await ctx.reply('Секунду, оформляю…', { reply_markup: { remove_keyboard: true } });
    await placeBooking(
      ctx,
      db,
      chatId,
      state.booking,
      name,
      contact.phone_number,
      account?.id,
      siteUrl,
    );
  });

  /* ── Фото: аватарка ─────────────────────────────────────── */

  bot.on('message:photo', async (ctx) => {
    const db = ref.db;
    const chatId = chat(ctx);
    const state = await readState(db, chatId);
    if (state.awaiting !== 'photo') {
      await ctx.reply('Красивое фото! Чтобы поставить его на аватарку, откройте /me → «Фото».');
      return;
    }
    const message = await saveAvatar(ctx, db, chatId, displayName(ctx), token, env.IMAGES);
    await writeState(db, chatId, { ...state, awaiting: undefined });
    await ctx.reply(message);
    await sendCabinet(ctx, db, chatId, displayName(ctx));
  });

  /* ── Свободный текст ────────────────────────────────────── */

  bot.on('message:text', async (ctx) => {
    const db = ref.db;
    const chatId = chat(ctx);
    const state = await readState(db, chatId);

    // Ждём ответ на поле кабинета — значит это он, а не вопрос администратору.
    if (state.awaiting && state.awaiting !== 'photo') {
      const result = await applyEdit(db, chatId, state.awaiting, ctx.message.text, displayName(ctx));
      if (!result.ok) {
        await ctx.reply(result.message);
        return;
      }
      await writeState(db, chatId, { ...state, awaiting: undefined });
      await ctx.reply(result.message);
      await sendCabinet(ctx, db, chatId, displayName(ctx));
      return;
    }

    const admins = await db.query.users.findMany({
      where: and(eq(users.role, 'admin'), isNotNull(users.telegramChatId)),
      columns: { telegramChatId: true },
    });

    const isAdmin = admins.some((a) => a.telegramChatId === chatId);
    if (isAdmin) return; // не пересылаем сообщения админов самим себе

    const sender = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatId),
      columns: { name: true, phone: true, email: true },
    });
    const from = ctx.from;
    const signature = sender
      ? `${sender.name}${sender.phone ? `, ${sender.phone}` : ''}`
      : `@${from?.username ?? from?.first_name ?? 'гость'}`;

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      await ctx.api.sendMessage(
        admin.telegramChatId,
        `💬 <b>Сообщение из бота</b>\nОт: ${signature} (chat ${chatId})\n\n${ctx.message.text}`,
        { parse_mode: 'HTML' },
      );
    }
    await ctx.reply(
      admins.length > 0
        ? 'Передали Елене — ответим в ближайшее время! 🙌'
        : 'Спасибо! Мы получили сообщение и скоро ответим.',
      { reply_markup: mainMenu(false, siteUrl) },
    );
  });

  bot.catch((err) => console.error('Bot error:', err.message));

  return bot;
}

/** Кеш бота между запросами воркера: избегаем повторного getMe на каждый апдейт. */
let cached: { bot: Bot; ref: DbRef; token: string } | null = null;

export function getBot(env: Bindings, db: Db): Bot {
  if (!cached || cached.token !== env.TELEGRAM_BOT_TOKEN) {
    const ref: DbRef = { db };
    cached = { bot: buildBot(env, ref), ref, token: env.TELEGRAM_BOT_TOKEN! };
  }
  cached.ref.db = db;
  return cached.bot;
}
