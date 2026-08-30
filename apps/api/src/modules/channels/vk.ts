import { settings, type Db } from '@tver/db';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../../env';
import { screenFor, type Screen } from './screens';

/**
 * Канал «ВКонтакте» через Callback API сообщества.
 *
 * Отличий от Telegram два, и оба важные. Первое: подтверждение адреса —
 * ВК присылает событие «confirmation» и ждёт в ответ строку из настроек
 * сообщества, иначе вебхук не включится. Второе: отвечать на событие надо
 * словом «ok» в течение пары секунд, а сами сообщения отправлять отдельным
 * запросом к API.
 */

const API = 'https://api.vk.com/method';
const VERSION = '5.199';

const CONFIRMATION_KEY = 'vk.confirmation';
const SECRET_KEY = 'vk.secret';

export interface VkConfig {
  tokenSet: boolean;
  confirmation: string | null;
  secretSet: boolean;
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

export async function writeSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value), updatedAt: new Date() },
    });
}

export async function vkConfig(db: Db, env: Bindings): Promise<VkConfig> {
  return {
    tokenSet: Boolean(env.VK_GROUP_TOKEN),
    confirmation: await readSetting(db, CONFIRMATION_KEY),
    secretSet: Boolean(await readSetting(db, SECRET_KEY)),
  };
}

export async function saveVkSettings(
  db: Db,
  input: { confirmation?: string; secret?: string },
): Promise<void> {
  if (input.confirmation !== undefined) await writeSetting(db, CONFIRMATION_KEY, input.confirmation);
  if (input.secret !== undefined) await writeSetting(db, SECRET_KEY, input.secret);
}

/** Клавиатура ВК: своя разметка, но кнопки те же, что в общих экранах. */
function keyboardOf(screen: Screen) {
  return JSON.stringify({
    inline: true,
    buttons: screen.buttons.map((row) =>
      row.map((button) => ({
        action: { type: 'text', label: button.label.slice(0, 40), payload: JSON.stringify({ a: button.action }) },
        color: 'secondary',
      })),
    ),
  });
}

async function callVk(token: string, method: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: token, v: VERSION });
  const response = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await response.json()) as { error?: { error_msg?: string } };
  if (data.error) throw new Error(data.error.error_msg ?? `ВКонтакте отклонил ${method}`);
  return data;
}

export async function sendVk(token: string, peerId: string, screen: Screen): Promise<void> {
  await callVk(token, 'messages.send', {
    peer_id: peerId,
    message: screen.text.slice(0, 4000),
    keyboard: keyboardOf(screen),
    // ВК требует случайный ключ, иначе считает сообщение повтором.
    random_id: String(Math.floor(Math.random() * 2 ** 31)),
  });
}

/** Имя человека для новой учётной записи. */
async function vkName(token: string, userId: string): Promise<string> {
  try {
    const data = (await callVk(token, 'users.get', { user_ids: userId })) as {
      response?: { first_name?: string; last_name?: string }[];
    };
    const user = data.response?.[0];
    return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'Гость';
  } catch {
    return 'Гость';
  }
}

interface VkUpdate {
  type?: string;
  secret?: string;
  object?: {
    message?: { from_id?: number; peer_id?: number; text?: string; payload?: string };
  };
}

/**
 * Обработка события Callback API.
 *
 * Возвращает готовый ответ: строку подтверждения либо «ok». Любая другая
 * реакция заставит ВК считать вебхук нерабочим и слать событие повторно.
 */
export async function handleVkUpdate(db: Db, env: Bindings, update: VkUpdate): Promise<Response> {
  const expectedSecret = await readSetting(db, SECRET_KEY);
  if (expectedSecret && update.secret !== expectedSecret) {
    return new Response('forbidden', { status: 403 });
  }

  if (update.type === 'confirmation') {
    const confirmation = await readSetting(db, CONFIRMATION_KEY);
    return new Response(confirmation ?? '', { status: 200 });
  }

  if (update.type !== 'message_new' || !env.VK_GROUP_TOKEN) return new Response('ok');

  const message = update.object?.message;
  const peerId = message?.peer_id ?? message?.from_id;
  if (!peerId) return new Response('ok');

  const externalId = String(message?.from_id ?? peerId);
  const token = env.VK_GROUP_TOKEN;

  // Нажатие кнопки приходит в payload, обычный текст — в text.
  let action = 'menu';
  if (message?.payload) {
    try {
      const parsed = JSON.parse(message.payload) as { a?: string };
      if (parsed.a) action = parsed.a;
    } catch {
      /* payload не наш — считаем обычным сообщением */
    }
  }

  const name = await vkName(token, externalId);
  const screen = await screenFor(db, 'vk', externalId, name, action);
  await sendVk(token, String(peerId), screen);

  return new Response('ok');
}
