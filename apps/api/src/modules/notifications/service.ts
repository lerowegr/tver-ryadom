import type { Db } from '@tver/db';
import { notifications } from '@tver/db';
import type { Pagination } from '@tver/shared';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';

/**
 * Внутрисайтовые уведомления личного кабинета.
 * Внешние каналы (Telegram, email) подключаются на этапе 6 через outbox.
 */
export async function createNotification(
  db: Db,
  userId: string,
  type: string,
  payload: Record<string, unknown> = {},
) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId,
    type,
    payload,
  });
}

export async function listNotifications(db: Db, userId: string, pagination: Pagination) {
  const where = eq(notifications.userId, userId);
  const [totalRow] = await db.select({ total: count() }).from(notifications).where(where);
  const [unreadRow] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(where, isNull(notifications.readAt)));

  const items = await db.query.notifications.findMany({
    where,
    orderBy: (n, { desc: sortDesc }) => [sortDesc(n.createdAt)],
    limit: pagination.limit,
    offset: (pagination.page - 1) * pagination.limit,
  });

  return { items, total: totalRow?.total ?? 0, unread: unreadRow?.total ?? 0 };
}

/** Помечает прочитанными переданные уведомления либо все сразу. */
export async function markNotificationsRead(db: Db, userId: string, ids?: string[]) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids && ids.length > 0) conditions.push(inArray(notifications.id, ids));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}
