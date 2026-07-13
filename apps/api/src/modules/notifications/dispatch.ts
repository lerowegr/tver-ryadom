import type { Db } from '@tver/db';
import { outbox, users } from '@tver/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { TemplatePayload } from './templates';
import { createNotification } from './service';

interface Recipient {
  id: string;
  email: string | null;
  telegramChatId: string | null;
}

async function enqueue(
  db: Db,
  channel: 'telegram' | 'email',
  recipient: string,
  template: string,
  payload: TemplatePayload,
) {
  await db.insert(outbox).values({
    id: crypto.randomUUID(),
    channel,
    recipient,
    template,
    payload,
    scheduledAt: new Date(),
  });
}

/**
 * Уведомляет пользователя по всем подключённым каналам:
 * запись в ЛК + outbox для Telegram и email (доставит cron).
 */
export async function notifyUser(
  db: Db,
  userId: string,
  template: string,
  payload: TemplatePayload,
) {
  await createNotification(db, userId, template, payload);

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, telegramChatId: true },
  });
  if (!user) return;
  await enqueueChannels(db, user, template, payload);
}

async function enqueueChannels(db: Db, user: Recipient, template: string, payload: TemplatePayload) {
  if (user.telegramChatId) await enqueue(db, 'telegram', user.telegramChatId, template, payload);
  if (user.email) await enqueue(db, 'email', user.email, template, payload);
}

/** Сообщение администраторам в Telegram (о новых бронях и заявках). */
export async function notifyAdmins(db: Db, template: string, payload: TemplatePayload) {
  const admins = await db.query.users.findMany({
    where: and(eq(users.role, 'admin'), isNotNull(users.telegramChatId)),
    columns: { telegramChatId: true },
  });
  for (const admin of admins) {
    if (admin.telegramChatId) {
      await enqueue(db, 'telegram', admin.telegramChatId, template, payload);
    }
  }
}
