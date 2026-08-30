import { USER_ROLES } from '@tver/shared';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './helpers';

export const users = sqliteTable(
  'users',
  {
    id: id(),
    /** Nullable: пользователи, созданные из Telegram-бота, могут не иметь email. */
    email: text('email'),
    phone: text('phone'),
    name: text('name').notNull(),
    /** Nullable: для OAuth/Telegram-аккаунтов без пароля. */
    passwordHash: text('password_hash'),
    role: text('role', { enum: USER_ROLES }).notNull().default('user'),
    /** Ключ файла в R2. Кадрирует пользователь в кабинете, хранится квадрат. */
    avatarKey: text('avatar_key'),
    emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }),
    telegramChatId: text('telegram_chat_id'),
    /** Идентификатор во «ВКонтакте»: один человек — одна запись на все каналы. */
    vkUserId: text('vk_user_id'),
    /** Идентификатор в MAX. */
    maxUserId: text('max_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_idx').on(t.email),
    uniqueIndex('users_telegram_chat_idx').on(t.telegramChatId),
    uniqueIndex('users_vk_idx').on(t.vkUserId),
    uniqueIndex('users_max_idx').on(t.maxUserId),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);
