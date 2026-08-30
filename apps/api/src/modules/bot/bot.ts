import type { Db } from '@tver/db';
import { users } from '@tver/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { Bot } from 'grammy';
import type { Bindings } from '../../env';
import { verifyLinkCode } from '../../lib/tg-link';
import {
  askConfirm,
  askDay,
  askPeople,
  askTime,
  confirmBooking,
  dropDraft,
  mainMenu,
  placeBooking,
  readDraft,
  safeDelete,
  sendCarousel,
  sendMyBookings,
  sendTourDetails,
  startBooking,
  toggleReminder,
} from './flows';

interface DbRef {
  db: Db;
}

/** Москва круглый год на UTC+3, перевода часов нет. */
const MSK_OFFSET = '+03:00';

const WELCOME = (siteUrl: string) =>
  `👋 Это бот «Тверь рядом» — авторские экскурсии по Твери.

Здесь можно посмотреть маршруты с фотографиями, забронировать место в несколько нажатий и следить за своими бронями.

Чтобы брони с сайта были видны и здесь, привяжите аккаунт: на ${siteUrl}/account нажмите «Привязать Telegram».

Любое сообщение здесь мы передадим администратору.`;

export function buildBot(env: Bindings, ref: DbRef): Bot {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const siteUrl = env.SITE_URL ?? 'http://localhost:3000';
  const imagesBase = (env.IMAGES_BASE_URL ?? `${siteUrl}/images`).replace(/\/$/, '');

  bot.command('start', async (ctx) => {
    const code = ctx.match?.trim();
    if (code) {
      const userId = await verifyLinkCode(env.JWT_SECRET, code);
      if (!userId) {
        await ctx.reply('Ссылка привязки устарела. Откройте личный кабинет и попробуйте снова.');
        return;
      }
      const db = ref.db;
      const chatId = String(ctx.chat.id);
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
        `✅ Готово, ${user?.name ?? 'друг'}! Аккаунт привязан.\n\nТеперь подтверждения броней и напоминания приходят сюда.`,
        { reply_markup: mainMenu() },
      );
      return;
    }
    await ctx.reply(WELCOME(siteUrl), { reply_markup: mainMenu() });
  });

  bot.command(['menu', 'help'], (ctx) =>
    ctx.reply(WELCOME(siteUrl), { reply_markup: mainMenu() }),
  );

  bot.command('tours', (ctx) => sendCarousel(ctx, ref.db, imagesBase, 0, false));
  bot.command('mybookings', (ctx) =>
    sendMyBookings(ctx, ref.db, String(ctx.chat.id), siteUrl),
  );

  /* ── Кнопки ─────────────────────────────────────────────── */

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(WELCOME(siteUrl), { reply_markup: mainMenu() });
  });

  bot.callbackQuery('menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await safeDelete(ctx);
    await ctx.reply(WELCOME(siteUrl), { reply_markup: mainMenu() });
  });

  bot.callbackQuery('t:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendCarousel(ctx, ref.db, imagesBase, 0, false);
  });

  // Счётчик «2 из 3» — не кнопка, но нажать её можно: гасим часики.
  bot.callbackQuery('t:noop', (ctx) => ctx.answerCallbackQuery());

  // «Свернуть»: убираем сообщение, из которого нажали, и всё.
  bot.callbackQuery('t:back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await safeDelete(ctx);
  });

  bot.callbackQuery(/^t:i:(-?\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendCarousel(ctx, ref.db, imagesBase, Number(ctx.match[1]), true);
  });

  bot.callbackQuery('my:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMyBookings(ctx, ref.db, String(ctx.chat?.id), siteUrl);
  });

  bot.callbackQuery(/^t:(?!list$|noop$|back$|i:)(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendTourDetails(ctx, ref.db, ctx.match[1]!);
  });

  bot.callbackQuery(/^b:go:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await startBooking(ctx, ref.db, String(ctx.chat?.id), ctx.match[1]!);
  });

  bot.callbackQuery('b:days', async (ctx) => {
    await ctx.answerCallbackQuery();
    await askDay(ctx, ref.db, String(ctx.chat?.id));
  });

  bot.callbackQuery(/^b:s:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askPeople(ctx, ref.db, String(ctx.chat?.id), {
      scheduleId: ctx.match[1]!,
      desiredDate: undefined,
    });
  });

  bot.callbackQuery(/^b:d:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askTime(ctx, ref.db, String(ctx.chat?.id), ctx.match[1]!);
  });

  bot.callbackQuery(/^b:h:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = String(ctx.chat?.id);
    const draft = await readDraft(ref.db, chatId);
    if (!draft?.desiredDate) return void ctx.reply('Начните заново: /tours');
    // Дата и время складываются здесь: время приходит отдельным нажатием.
    // Пояс указываем явно: воркер живёт по UTC и «10:00» без смещения понял
    // бы как десять утра по Гринвичу, то есть час дня по Москве.
    await askPeople(ctx, ref.db, chatId, {
      desiredDate: `${draft.desiredDate.slice(0, 10)}T${ctx.match[1]}:00${MSK_OFFSET}`,
    });
  });

  bot.callbackQuery(/^b:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await askConfirm(ctx, ref.db, String(ctx.chat?.id), Number(ctx.match[1]));
  });

  bot.callbackQuery('b:ok', async (ctx) => {
    await ctx.answerCallbackQuery();
    await confirmBooking(ctx, ref.db, String(ctx.chat?.id), siteUrl);
  });

  bot.callbackQuery('b:x', async (ctx) => {
    await ctx.answerCallbackQuery('Отменено');
    await dropDraft(ref.db, String(ctx.chat?.id));
    // Возвращаем туда, откуда пришли: карточка вместо тупика с меню.
    await sendCarousel(ctx, ref.db, imagesBase, 0, true);
  });

  bot.callbackQuery(/^my:r:(.+)$/, (ctx) =>
    toggleReminder(ctx, ref.db, String(ctx.chat?.id), ctx.match[1]!),
  );

  bot.callbackQuery(/^my:c:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Отмену брони делаем вручную, чтобы ничего не потерялось: напишите сюда причину — я передам администратору. Либо отмените в кабинете: ${siteUrl}/account/bookings`,
    );
  });

  /* ── Контакт: последний шаг брони ───────────────────────── */

  bot.on('message:contact', async (ctx) => {
    const db = ref.db;
    const chatId = String(ctx.chat.id);
    const draft = await readDraft(db, chatId);
    if (!draft?.people) {
      await ctx.reply('Спасибо! Номер пригодится, когда будете бронировать.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const contact = ctx.message.contact;
    // Чужой контакт не подходит: подтверждать бронь будем по номеру того,
    // кто её оформляет.
    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply('Нужен ваш собственный номер — нажмите кнопку ещё раз.');
      return;
    }

    const name =
      [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
      ctx.from?.first_name ||
      'Гость';

    const account = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatId),
      columns: { id: true },
    });

    await ctx.reply('Секунду, оформляю…', { reply_markup: { remove_keyboard: true } });
    await placeBooking(ctx, db, chatId, draft, name, contact.phone_number, account?.id, siteUrl);
  });

  /* ── Свободный текст — администраторам ──────────────────── */

  bot.on('message:text', async (ctx) => {
    const db = ref.db;
    const chatId = String(ctx.chat.id);
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
        ? 'Передали администратору — ответим в ближайшее время! 🙌'
        : 'Спасибо! Мы получили сообщение и скоро ответим.',
      { reply_markup: mainMenu() },
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
