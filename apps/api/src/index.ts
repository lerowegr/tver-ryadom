import { createDb } from '@tver/db';
import { buildApp } from './app';
import type { Bindings } from './env';
import { processOutbox } from './modules/notifications/outbox';
import { enqueueReminders } from './modules/notifications/reminders';

const app = buildApp();

export default {
  fetch: app.fetch,

  /** Cron Trigger (раз в минуту): напоминания за сутки + доставка outbox. */
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    const db = createDb(env.DB);
    ctx.waitUntil(
      (async () => {
        const reminders = await enqueueReminders(db, env.SITE_URL);
        const outbox = await processOutbox(db, env);
        console.log(JSON.stringify({ cron: 'notifications', ...reminders, ...outbox }));
      })(),
    );
  },
};
