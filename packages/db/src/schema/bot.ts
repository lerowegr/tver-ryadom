import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { updatedAt } from './helpers';

/**
 * Черновик брони, набираемый в боте.
 *
 * Воркер не помнит ничего между запросами, а бронь собирается за несколько
 * нажатий. Складывать шаги в callback_data нельзя: у него потолок 64 байта,
 * а идентификатор слота — уже 36 символов. Поэтому состояние живёт здесь,
 * по одному черновику на чат: параллельных броней у человека не бывает.
 */
export const botDrafts = sqliteTable('bot_drafts', {
  chatId: text('chat_id').primaryKey(),
  /** JSON: экскурсия, слот или дата со временем, число участников. */
  payload: text('payload').notNull(),
  updatedAt: updatedAt(),
});
