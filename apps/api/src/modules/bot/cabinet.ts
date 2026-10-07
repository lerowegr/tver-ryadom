import { users, type Db } from '@tver/db';
import { escapeHtml, normalizeRuPhone } from '@tver/shared';
import { eq } from 'drizzle-orm';
import { InlineKeyboard, type Context } from 'grammy';

/**
 * Личный кабинет в боте.
 *
 * Данные лежат в той же таблице пользователей, что и у сайта, поэтому
 * синхронизация не нужна как отдельный механизм: это буквально одна запись.
 * Фотография кладётся в R2 под тем же ключом, что использует кабинет на
 * сайте, — значит смена аватарки здесь видна там и наоборот.
 */

export type Awaiting = 'name' | 'phone' | 'email' | 'photo';

/**
 * Находит или заводит аккаунт для чата.
 *
 * Создаём лениво — в момент, когда человеку действительно нужна учётная
 * запись: открыл кабинет, добавил избранное, оформил бронь. Иначе каждый
 * заглянувший оставлял бы после себя пустого пользователя.
 */
export async function ensureAccount(
  db: Db,
  chatId: string,
  displayName: string,
): Promise<{ id: string; name: string; phone: string | null; email: string | null; avatarKey: string | null }> {
  const existing = await db.query.users.findFirst({
    where: eq(users.telegramChatId, chatId),
    columns: { id: true, name: true, phone: true, email: true, avatarKey: true },
  });
  if (existing) return existing;

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    name: displayName || 'Гость',
    telegramChatId: chatId,
    // Ни почты, ни пароля: аккаунт создан из мессенджера. Схема это допускает,
    // а войти на сайт можно будет, задав пароль через восстановление.
    email: null,
    passwordHash: null,
  });
  return { id, name: displayName || 'Гость', phone: null, email: null, avatarKey: null };
}

function line(label: string, value: string | null, fallback: string): string {
  return `${label}: ${value ? escapeHtml(value) : `<i>${fallback}</i>`}`;
}

export async function cabinetText(
  db: Db,
  chatId: string,
  displayName: string,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const account = await ensureAccount(db, chatId, displayName);

  const text = [
    '<b>👤 Личный кабинет</b>',
    '',
    line('Имя', account.name, 'не указано'),
    line('Телефон', account.phone, 'не указан'),
    line('Почта', account.email, 'не указана'),
    `Фото: ${account.avatarKey ? 'загружено' : '<i>нет</i>'}`,
    '',
    '<i>Эти же данные видны в кабинете на сайте — правка здесь меняет их везде.</i>',
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('Имя', 'me:e:name')
    .text('Телефон', 'me:e:phone')
    .row()
    .text('Почта', 'me:e:email')
    .text('Фото', 'me:e:photo')
    .row()
    .text('📋 Мои брони', 'my:list')
    .text('❤️ Избранное', 'fav:list')
    .row()
    .text('← Меню', 'menu');

  return { text, keyboard };
}

/** Что просим прислать на каждом из полей. */
export const PROMPTS: Record<Awaiting, string> = {
  name: 'Напишите, как к вам обращаться.',
  phone: 'Пришлите номер телефона — можно текстом или кнопкой «Поделиться контактом».',
  email: 'Напишите адрес почты. Чтобы убрать её, отправьте «-».',
  photo: 'Пришлите фотографию — она станет вашей аватаркой на сайте и здесь.',
};

/**
 * Сохраняет присланное значение.
 *
 * Возвращает текст ответа: либо подтверждение, либо объяснение, что не так.
 * Проверки те же, что на сайте, — телефон приводится к +7XXXXXXXXXX.
 */
export async function applyEdit(
  db: Db,
  chatId: string,
  field: Awaiting,
  raw: string,
  displayName: string,
): Promise<{ ok: boolean; message: string }> {
  const account = await ensureAccount(db, chatId, displayName);
  const value = raw.trim();

  if (field === 'name') {
    if (value.length < 2 || value.length > 100) {
      return { ok: false, message: 'Имя должно быть от 2 до 100 символов. Попробуйте ещё раз.' };
    }
    await db.update(users).set({ name: value, updatedAt: new Date() }).where(eq(users.id, account.id));
    return { ok: true, message: `Готово, теперь вы ${escapeHtml(value)}.` };
  }

  if (field === 'phone') {
    const normalized = normalizeRuPhone(value);
    if (!normalized) {
      return {
        ok: false,
        message: 'Это не похоже на российский номер. Пришлите в виде +7 900 123-45-67.',
      };
    }
    await db
      .update(users)
      .set({ phone: normalized, updatedAt: new Date() })
      .where(eq(users.id, account.id));
    return { ok: true, message: `Телефон сохранён: ${normalized}` };
  }

  if (field === 'email') {
    if (value === '-') {
      await db.update(users).set({ email: null, updatedAt: new Date() }).where(eq(users.id, account.id));
      return { ok: true, message: 'Почта убрана.' };
    }
    // Простая проверка формы: подтверждение адреса письмом — отдельная задача.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { ok: false, message: 'Адрес выглядит неправильно. Пример: elena@example.ru' };
    }
    const taken = await db.query.users.findFirst({
      where: eq(users.email, value),
      columns: { id: true },
    });
    if (taken && taken.id !== account.id) {
      return { ok: false, message: 'Эта почта уже занята другим аккаунтом.' };
    }
    await db.update(users).set({ email: value, updatedAt: new Date() }).where(eq(users.id, account.id));
    return { ok: true, message: `Почта сохранена: ${escapeHtml(value)}` };
  }

  return { ok: false, message: 'Пришлите фотографию.' };
}

/**
 * Сохраняет аватарку из присланного фото.
 *
 * Ключ тот же, что у кабинета на сайте, — файл перезаписывается, и мусор в
 * хранилище не копится.
 */
export async function saveAvatar(
  ctx: Context,
  db: Db,
  chatId: string,
  displayName: string,
  token: string,
  bucket: R2Bucket,
): Promise<string> {
  const account = await ensureAccount(db, chatId, displayName);
  const photos = ctx.message?.photo;
  if (!photos?.length) return 'Не вижу фотографии — пришлите ещё раз.';

  // Телеграм присылает несколько размеров; последний — самый крупный.
  const largest = photos[photos.length - 1]!;
  if (largest.file_size && largest.file_size > 5 * 1024 * 1024) {
    return 'Фотография больше 5 МБ — пришлите поменьше.';
  }

  const file = await ctx.api.getFile(largest.file_id);
  if (!file.file_path) return 'Не удалось забрать файл у Telegram. Попробуйте ещё раз.';

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) return 'Не удалось скачать фотографию. Попробуйте ещё раз.';

  const key = `avatars/${account.id}.webp`;
  await bucket.put(key, await response.arrayBuffer(), {
    // Телеграм отдаёт JPEG; расширение в ключе историческое, важен тип.
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=60' },
  });
  await db.update(users).set({ avatarKey: key, updatedAt: new Date() }).where(eq(users.id, account.id));

  return 'Фото обновлено — оно уже видно и в кабинете на сайте.';
}
