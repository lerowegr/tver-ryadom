import { settings, type Db } from '@tver/db';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../../env';

/**
 * Подключение бота к Telegram.
 *
 * Раньше вебхук нигде не регистрировался: обработчик в приложении был, а
 * сказать Telegram его адрес было некому — бот молчал бы даже с верным
 * токеном. Теперь это делает кнопка в админке, и токен при этом остаётся
 * внутри Cloudflare: наружу он не передаётся ни разу.
 */

const SECRET_KEY = 'telegram.webhookSecret';
const USERNAME_KEY = 'telegram.username';

/** Меню команд — то самое синее «Меню» рядом с полем ввода. */
const COMMANDS = [
  { command: 'menu', description: 'Главное меню' },
  { command: 'tours', description: 'Экскурсии с фото и ценами' },
  { command: 'mybookings', description: 'Мои брони и напоминания' },
  { command: 'favorites', description: 'Избранные маршруты' },
  { command: 'me', description: 'Личный кабинет' },
  { command: 'help', description: 'Про экскурсии и Елену' },
];

export interface BotStatus {
  tokenSet: boolean;
  /**
   * Длина токена — не сам он.
   *
   * Нужна ровно для одного случая: секрет в списке воркера есть, а код его
   * не видит. Ноль означает пустое значение (при вводе токен не отображается,
   * и вставка легко проходит мимо), отсутствие поля — что привязки нет вовсе.
   */
  tokenLength: number;
  username: string | null;
  webhookUrl: string | null;
  pendingUpdates: number | null;
  lastError: string | null;
}

async function readSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return row.value;
  }
}

async function writeSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value), updatedAt: new Date() },
    });
}

/**
 * Секрет в адресе вебхука.
 *
 * Если он задан переменной окружения — берём её. Иначе заводим свой и
 * храним в настройках: так для запуска бота достаточно одного токена,
 * а не двух секретов подряд.
 */
export async function readWebhookSecret(db: Db, env: Bindings): Promise<string | null> {
  return env.TELEGRAM_WEBHOOK_SECRET ?? (await readSetting(db, SECRET_KEY));
}

/**
 * То же, но заводит секрет, если его ещё нет.
 *
 * Вызывается только из подключения бота: сам вебхук ходит через чтение —
 * это открытый маршрут, и запись в базу по чужому запросу там ни к чему.
 */
export async function ensureWebhookSecret(db: Db, env: Bindings): Promise<string> {
  const existing = await readWebhookSecret(db, env);
  if (existing) return existing;

  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await writeSetting(db, SECRET_KEY, secret);
  return secret;
}

/** Имя бота для deep-link: из переменной окружения либо из того, что вернул getMe. */
export async function resolveBotUsername(db: Db, env: Bindings): Promise<string | null> {
  return env.TELEGRAM_BOT_USERNAME ?? (await readSetting(db, USERNAME_KEY));
}

async function telegram<T>(token: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(data.description ?? `Telegram отклонил ${method}`);
  return data.result as T;
}

export async function botStatus(db: Db, env: Bindings): Promise<BotStatus> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return {
      tokenSet: false,
      tokenLength: env.TELEGRAM_BOT_TOKEN === undefined ? -1 : env.TELEGRAM_BOT_TOKEN.length,
      username: null,
      webhookUrl: null,
      pendingUpdates: null,
      lastError: null,
    };
  }
  const username = await resolveBotUsername(db, env);
  try {
    const info = await telegram<{
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
    }>(env.TELEGRAM_BOT_TOKEN, 'getWebhookInfo');
    return {
      tokenSet: true,
      tokenLength: env.TELEGRAM_BOT_TOKEN.length,
      username,
      webhookUrl: info.url || null,
      pendingUpdates: info.pending_update_count ?? 0,
      lastError: info.last_error_message ?? null,
    };
  } catch (error) {
    return {
      tokenSet: true,
      tokenLength: env.TELEGRAM_BOT_TOKEN.length,
      username,
      webhookUrl: null,
      pendingUpdates: null,
      lastError: error instanceof Error ? error.message : 'Telegram недоступен',
    };
  }
}

/** Регистрирует вебхук, заполняет меню команд и запоминает имя бота. */
export async function configureBot(db: Db, env: Bindings, origin: string): Promise<BotStatus> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Токен бота не задан');

  const me = await telegram<{ username?: string }>(env.TELEGRAM_BOT_TOKEN, 'getMe');
  if (me.username) await writeSetting(db, USERNAME_KEY, me.username);

  const secret = await ensureWebhookSecret(db, env);
  await telegram(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
    url: `${origin}/webhook/telegram/${secret}`,
    allowed_updates: ['message', 'callback_query'],
    // Копившиеся апдейты за время без вебхука отвечать поздно.
    drop_pending_updates: true,
  });

  await telegram(env.TELEGRAM_BOT_TOKEN, 'setMyCommands', { commands: COMMANDS });

  return botStatus(db, env);
}

export async function disableBot(db: Db, env: Bindings): Promise<BotStatus> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Токен бота не задан');
  await telegram(env.TELEGRAM_BOT_TOKEN, 'deleteWebhook', { drop_pending_updates: true });
  return botStatus(db, env);
}
