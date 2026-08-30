import { settings, tours, type Db } from '@tver/db';
import { formatPrice } from '@tver/shared';
import { eq } from 'drizzle-orm';
import { InlineKeyboard, type Context } from 'grammy';

/**
 * Содержательные экраны бота: приветствие и рассказ о формате.
 *
 * Тексты берутся из тех же настроек, что показывает сайт. Дублировать их
 * в коде нельзя: Елена правит их в админке, и копия в боте немедленно
 * начала бы отставать.
 */

/** Все настройки одним запросом, значения уже развёрнуты из JSON. */
export async function readSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Приветствие.
 *
 * Пишем от лица Елены, а не «сервиса»: экскурсии у неё авторские, и первое
 * сообщение задаёт тон всему разговору.
 */
export async function welcomeText(db: Db): Promise<string> {
  const cfg = await readSettings(db);
  const tagline = str(cfg['company.tagline']) ?? 'Авторские экскурсии по Твери';

  return [
    'Здравствуйте! Меня зовут Елена Громова, я аттестованный экскурсовод по Твери.',
    '',
    `<i>${escapeHtml(tagline)}</i>`,
    '',
    'Здесь можно посмотреть маршруты с фотографиями, забронировать прогулку в несколько нажатий и следить за своими бронями. Если проще спросить словами — просто напишите мне сюда.',
  ].join('\n');
}

/**
 * «Про экскурсии»: кто ведёт и как всё устроено.
 *
 * Формат считаем по самим экскурсиям, а не пишем руками: длительность и
 * цены меняются в админке, и захардкоженный текст начал бы врать.
 */
export async function aboutText(db: Db): Promise<string> {
  const cfg = await readSettings(db);
  const intro = str(cfg['about.intro']);

  const list = await db.query.tours.findMany({
    where: eq(tours.status, 'published'),
    columns: { price: true, priceType: true, durationMinutes: true, groupMin: true, groupMax: true },
  });

  const parts: string[] = ['<b>Про экскурсии</b>', ''];

  if (intro) {
    parts.push(...intro.split('\n').filter(Boolean).map(escapeHtml), '');
  }

  if (list.length > 0) {
    const minPrice = Math.min(...list.map((t) => t.price));
    const hours = list.map((t) => t.durationMinutes / 60);
    const shortest = Math.min(...hours);
    const longest = Math.max(...hours);
    const biggest = Math.max(...list.map((t) => t.groupMax ?? t.groupMin));

    const duration =
      shortest === longest
        ? `${fmtHours(shortest)}`
        : `от ${fmtHours(shortest)} до ${fmtHours(longest)}`;

    parts.push(
      '<b>Как это устроено</b>',
      `• Маршрутов сейчас: ${list.length}`,
      `• Продолжительность: ${duration}`,
      `• Группы небольшие, до ${biggest} человек`,
      `• Цена: от ${formatPrice(minPrice)}`,
      '• Бронь — это заявка, а не оплата: я свяжусь и подтвердим детали',
    );
  }

  return parts.join('\n');
}

function fmtHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ч`;
}

export async function sendAbout(ctx: Context, db: Db): Promise<void> {
  const text = await aboutText(db);
  const keyboard = new InlineKeyboard()
    .text('🗺 Посмотреть маршруты', 't:list')
    .row()
    .text('← Меню', 'menu');

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
    return;
  } catch {
    /* текущее сообщение с фотографией — заменить текстом нельзя */
  }
  try {
    await ctx.deleteMessage();
  } catch {
    /* уже удалено или слишком старое */
  }
  await ctx.reply(text, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}
