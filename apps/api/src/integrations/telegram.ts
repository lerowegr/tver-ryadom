import type { Bindings } from '../env';

/**
 * Отправка сообщений через Bot API обычным fetch: для исходящих уведомлений
 * grammY не нужен (он используется только в webhook-обработчике бота).
 */
export async function sendTelegramMessage(
  env: Pick<Bindings, 'TELEGRAM_BOT_TOKEN'>,
  chatId: string,
  text: string,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN не задан — канал telegram выключен');
  }
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage ${res.status}: ${detail.slice(0, 200)}`);
  }
}
