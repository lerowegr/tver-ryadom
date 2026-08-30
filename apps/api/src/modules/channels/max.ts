import { settings, type Db } from '@tver/db';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../../env';
import { screenFor, type Screen } from './screens';

/**
 * Канал MAX — заготовка.
 *
 * ВАЖНО: адреса и имена методов у MAX я не подтверждал по документации,
 * поэтому они не зашиты в код, а лежат в настройках. Пока база не указана,
 * канал считается выключенным и ничего никуда не отправляет — молча
 * угадывать чужой протокол хуже, чем честно ждать проверки.
 *
 * Что уже работает без правок кода: приём вебхука с проверкой секрета,
 * разбор события в наш словарь действий, поиск или создание учётной записи
 * и сборка того же экрана, что видят во ВКонтакте. Остаётся подставить
 * настоящий адрес отправки — и канал оживёт.
 */

const BASE_KEY = 'max.apiBase';
const SEND_KEY = 'max.sendMethod';
const SECRET_KEY = 'max.secret';

export interface MaxConfig {
  tokenSet: boolean;
  apiBase: string | null;
  sendMethod: string;
  secretSet: boolean;
  ready: boolean;
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

export async function maxConfig(db: Db, env: Bindings): Promise<MaxConfig> {
  const apiBase = await readSetting(db, BASE_KEY);
  const sendMethod = (await readSetting(db, SEND_KEY)) ?? 'sendMessage';
  return {
    tokenSet: Boolean(env.MAX_BOT_TOKEN),
    apiBase,
    sendMethod,
    secretSet: Boolean(await readSetting(db, SECRET_KEY)),
    ready: Boolean(env.MAX_BOT_TOKEN && apiBase),
  };
}

export async function saveMaxSettings(
  db: Db,
  input: { apiBase?: string; sendMethod?: string; secret?: string },
): Promise<void> {
  if (input.apiBase !== undefined) await writeSetting(db, BASE_KEY, input.apiBase);
  if (input.sendMethod !== undefined) await writeSetting(db, SEND_KEY, input.sendMethod);
  if (input.secret !== undefined) await writeSetting(db, SECRET_KEY, input.secret);
}

/**
 * Отправка сообщения.
 *
 * Тело собрано по образцу Telegram: у MAX API заявлен похожим. Если поля
 * назовутся иначе, править нужно будет ровно это место.
 */
export async function sendMax(
  db: Db,
  env: Bindings,
  chatId: string,
  screen: Screen,
): Promise<void> {
  const config = await maxConfig(db, env);
  if (!config.ready || !env.MAX_BOT_TOKEN || !config.apiBase) return;

  const url = `${config.apiBase.replace(/\/$/, '')}/${config.sendMethod}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.MAX_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: screen.text.slice(0, 4000),
      reply_markup: {
        inline_keyboard: screen.buttons.map((row) =>
          row.map((button) => ({ text: button.label, callback_data: button.action })),
        ),
      },
    }),
  });
}

interface MaxUpdate {
  secret?: string;
  message?: { chat?: { id?: string | number }; from?: { id?: string | number; name?: string }; text?: string };
  callback?: { data?: string; from?: { id?: string | number; name?: string }; chat?: { id?: string | number } };
}

/** Приём события: проверка секрета, разбор действия и ответ тем же экраном. */
export async function handleMaxUpdate(db: Db, env: Bindings, update: MaxUpdate): Promise<Response> {
  const expected = await readSetting(db, SECRET_KEY);
  if (expected && update.secret !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  const source = update.callback ?? update.message;
  const chatId = source?.chat?.id ?? update.callback?.from?.id ?? update.message?.from?.id;
  const userId = source?.from?.id ?? chatId;
  if (chatId === undefined || userId === undefined) return new Response('ok');

  const action = update.callback?.data ?? 'menu';
  const name = source?.from?.name?.trim() || 'Гость';

  const screen = await screenFor(db, 'max', String(userId), name, action);
  await sendMax(db, env, String(chatId), screen);

  return new Response('ok');
}
