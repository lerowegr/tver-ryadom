import type { Db } from '@tver/db';
import { outbox } from '@tver/db';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { Bindings } from '../../env';
import { sendEmail } from '../../integrations/email';
import { sendTelegramMessage } from '../../integrations/telegram';
import { renderTemplate, type TemplatePayload } from './templates';

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;

export interface OutboxSenders {
  telegram: (recipient: string, text: string) => Promise<void>;
  email: (recipient: string, subject: string, html: string) => Promise<void>;
}

function defaultSenders(env: Bindings): OutboxSenders {
  return {
    telegram: (recipient, text) => sendTelegramMessage(env, recipient, text),
    email: (recipient, subject, html) => sendEmail(env, recipient, subject, html),
  };
}

/**
 * Доставляет пачку pending-записей outbox (вызывается Cron Trigger'ом раз в
 * минуту). Ошибки — ретрай с экспоненциальной паузой, после 3 попыток — failed.
 */
export async function processOutbox(db: Db, env: Bindings, senders: OutboxSenders = defaultSenders(env)) {
  const now = new Date();
  const batch = await db.query.outbox.findMany({
    where: and(eq(outbox.status, 'pending'), lte(outbox.scheduledAt, now)),
    orderBy: [asc(outbox.scheduledAt)],
    limit: BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;

  for (const item of batch) {
    const message = renderTemplate(item.template, (item.payload ?? {}) as TemplatePayload);
    try {
      if (item.channel === 'telegram') {
        await senders.telegram(item.recipient, message.text);
      } else if (item.channel === 'email') {
        await senders.email(item.recipient, message.subject, message.html);
      } else {
        throw new Error(`Канал «${item.channel}» пока не подключён`);
      }
      await db
        .update(outbox)
        .set({ status: 'sent', sentAt: new Date(), lastError: null })
        .where(eq(outbox.id, item.id));
      sent += 1;
    } catch (error) {
      const attempts = item.attempts + 1;
      const isFinal = attempts >= MAX_ATTEMPTS;
      await db
        .update(outbox)
        .set({
          attempts,
          status: isFinal ? 'failed' : 'pending',
          lastError: error instanceof Error ? error.message.slice(0, 500) : String(error),
          // Экспоненциальная пауза: 2, 4 минуты…
          scheduledAt: isFinal ? item.scheduledAt : new Date(Date.now() + 2 ** attempts * 60_000),
        })
        .where(eq(outbox.id, item.id));
      failed += 1;
    }
  }

  return { picked: batch.length, sent, failed };
}
