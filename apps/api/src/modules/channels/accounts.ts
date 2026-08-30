import { users, type Db } from '@tver/db';
import { eq } from 'drizzle-orm';

/**
 * Один человек — одна запись на все каналы.
 *
 * Синхронизация между сайтом, Telegram, ВКонтакте и MAX не отдельный
 * механизм: это буквально одна строка в таблице пользователей с тремя
 * идентификаторами. Бронь, избранное и профиль привязаны к ней, поэтому
 * что бы человек ни менял и откуда бы ни пришёл — данные общие.
 */

export const CHANNELS = ['telegram', 'vk', 'max'] as const;
export type ChannelId = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  telegram: 'Telegram',
  vk: 'ВКонтакте',
  max: 'MAX',
};

/** Колонка, в которой лежит идентификатор человека в этом канале. */
const COLUMN = {
  telegram: users.telegramChatId,
  vk: users.vkUserId,
  max: users.maxUserId,
} as const;

function patchFor(channel: ChannelId, externalId: string | null) {
  return channel === 'telegram'
    ? { telegramChatId: externalId }
    : channel === 'vk'
      ? { vkUserId: externalId }
      : { maxUserId: externalId };
}

export interface Account {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatarKey: string | null;
}

const COLUMNS = { id: true, name: true, phone: true, email: true, avatarKey: true } as const;

export async function findAccount(
  db: Db,
  channel: ChannelId,
  externalId: string,
): Promise<Account | null> {
  const row = await db.query.users.findFirst({
    where: eq(COLUMN[channel], externalId),
    columns: COLUMNS,
  });
  return row ?? null;
}

/**
 * Находит или заводит аккаунт для канала.
 *
 * Создаём лениво — когда учётная запись действительно нужна: открыл
 * кабинет, добавил избранное, оформил бронь. Иначе каждый заглянувший
 * оставлял бы после себя пустого пользователя.
 */
export async function ensureAccount(
  db: Db,
  channel: ChannelId,
  externalId: string,
  displayName: string,
): Promise<Account> {
  const existing = await findAccount(db, channel, externalId);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const name = displayName?.trim() || 'Гость';
  await db.insert(users).values({
    id,
    name,
    // Ни почты, ни пароля: аккаунт создан из мессенджера. Схема это
    // допускает, а войти на сайт можно, задав пароль восстановлением.
    email: null,
    passwordHash: null,
    ...patchFor(channel, externalId),
  });
  return { id, name, phone: null, email: null, avatarKey: null };
}

/**
 * Привязывает канал к существующему аккаунту.
 *
 * Один идентификатор канала может принадлежать только одному человеку,
 * поэтому сперва отвязываем его ото всех прочих: иначе уникальный индекс
 * не даст сохранить, а человек увидит невнятную ошибку.
 */
export async function linkAccount(
  db: Db,
  channel: ChannelId,
  externalId: string,
  userId: string,
): Promise<void> {
  await db
    .update(users)
    .set(patchFor(channel, null))
    .where(eq(COLUMN[channel], externalId));
  await db
    .update(users)
    .set({ ...patchFor(channel, externalId), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Какие каналы уже привязаны к аккаунту — для кабинета и админки. */
export async function linkedChannels(db: Db, userId: string): Promise<ChannelId[]> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { telegramChatId: true, vkUserId: true, maxUserId: true },
  });
  if (!row) return [];
  const result: ChannelId[] = [];
  if (row.telegramChatId) result.push('telegram');
  if (row.vkUserId) result.push('vk');
  if (row.maxUserId) result.push('max');
  return result;
}
