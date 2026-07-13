import type { Db } from '@tver/db';
import { bookings, schedules, tours, users } from '@tver/db';
import { formatPrice } from '@tver/shared';
import { and, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { Bot } from 'grammy';
import type { Bindings } from '../../env';
import { verifyLinkCode } from '../../lib/tg-link';
import { formatMsk } from '../notifications/templates';

interface DbRef {
  db: Db;
}

const WELCOME = (siteUrl: string) =>
  `👋 Привет! Это бот «Тверь рядом» — авторские экскурсии по Твери.

Что я умею:
/tours — список экскурсий
/mybookings — ваши брони (после привязки аккаунта)
/help — помощь

Чтобы получать подтверждения и напоминания, привяжите аккаунт: на сайте ${siteUrl}/account нажмите «Привязать Telegram».

Любое сообщение здесь мы передадим администратору.`;

export function buildBot(env: Bindings, ref: DbRef): Bot {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const siteUrl = env.SITE_URL ?? 'http://localhost:3000';

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
      await db.update(users).set({ telegramChatId: chatId, updatedAt: new Date() }).where(eq(users.id, userId));
      const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
      await ctx.reply(
        `✅ Готово, ${user?.name ?? 'друг'}! Аккаунт привязан.\n\nТеперь подтверждения броней и напоминания будут приходить сюда.`,
      );
      return;
    }
    await ctx.reply(WELCOME(siteUrl));
  });

  bot.command('help', (ctx) => ctx.reply(WELCOME(siteUrl)));

  bot.command('tours', async (ctx) => {
    const list = await ref.db.query.tours.findMany({
      where: eq(tours.status, 'published'),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
      limit: 6,
      columns: { title: true, slug: true, price: true, priceType: true, durationMinutes: true },
    });
    if (list.length === 0) {
      await ctx.reply('Экскурсий пока нет — загляните позже!');
      return;
    }
    const lines = list.map(
      (tour) =>
        `🌿 <b>${tour.title}</b>\nот ${formatPrice(tour.price)} ${tour.priceType === 'per_person' ? '/ чел.' : '/ группа'} · ${Math.round(tour.durationMinutes / 60 * 10) / 10} ч\n${siteUrl}/excursions/${tour.slug}`,
    );
    await ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
  });

  bot.command('mybookings', async (ctx) => {
    const db = ref.db;
    const chatId = String(ctx.chat.id);
    const user = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatId),
      columns: { id: true },
    });
    if (!user) {
      await ctx.reply(`Аккаунт не привязан. Откройте ${siteUrl}/account и нажмите «Привязать Telegram».`);
      return;
    }
    const now = new Date();
    const futureSlots = db.select({ id: schedules.id }).from(schedules).where(gt(schedules.startsAt, now));
    const upcoming = await db.query.bookings.findMany({
      where: and(
        eq(bookings.userId, user.id),
        inArray(bookings.status, ['pending', 'confirmed']),
        inArray(bookings.scheduleId, futureSlots),
      ),
      with: { tour: { columns: { title: true } }, schedule: { columns: { startsAt: true } } },
      orderBy: (b, { asc }) => [asc(b.createdAt)],
      limit: 10,
    });
    if (upcoming.length === 0) {
      await ctx.reply(`Предстоящих экскурсий нет. Выбрать новую: ${siteUrl}/excursions`);
      return;
    }
    const lines = upcoming.map(
      (b) =>
        `${b.status === 'confirmed' ? '✅' : '🕐'} <b>${b.tour?.title ?? 'Экскурсия'}</b>\n${b.schedule ? formatMsk(b.schedule.startsAt) : 'дата согласовывается'} · ${b.peopleCount} чел. · ${formatPrice(b.totalPrice)}`,
    );
    await ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
  });

  // Свободный текст — передаём администраторам.
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
