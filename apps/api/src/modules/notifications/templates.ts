/**
 * Шаблоны уведомлений: text — для Telegram (HTML-разметка Bot API),
 * subject+html — для писем. payload приходит из outbox.
 *
 * Все пользовательские поля экранируются через escapeHtml: сырьё хранится
 * в БД как есть, чистка — только на рендере.
 */
import { escapeHtml } from '@tver/shared';

export interface RenderedMessage {
  text: string;
  subject: string;
  html: string;
}

const mskFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

/** Дата-время для сообщений — всегда в московском времени (Тверь = МСК). */
export function formatMsk(date: Date): string {
  return mskFmt.format(date);
}

export interface TemplatePayload {
  tourTitle?: string;
  startsAt?: string;
  peopleCount?: number;
  totalPriceLabel?: string;
  contactName?: string;
  contactPhone?: string;
  siteUrl?: string;
  comment?: string;
  message?: string;
  [key: string]: unknown;
}

const wrap = (title: string, bodyHtml: string, siteUrl?: string) => `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fbf9f4;border-radius:16px;color:#2a2014">
  <p style="font-size:20px;font-weight:bold;margin:0 0 4px">Тверь <em style="color:#a65832">рядом</em></p>
  <h2 style="font-size:17px;margin:16px 0 8px">${escapeHtml(title)}</h2>
  ${bodyHtml}
  ${siteUrl ? `<p style="margin-top:20px"><a href="${escapeHtml(siteUrl)}/account/bookings" style="color:#a65832">Мои брони на сайте →</a></p>` : ''}
  <p style="color:#8a6d4f;font-size:12px;margin-top:24px">Если вы не оставляли заявку — просто игнорируйте это письмо.</p>
</div>`;

function bookingLines(p: TemplatePayload): string {
  const rows = [
    p.tourTitle ? `Экскурсия: ${escapeHtml(String(p.tourTitle))}` : null,
    p.startsAt ? `Дата: ${escapeHtml(String(p.startsAt))}` : null,
    p.peopleCount ? `Участников: ${escapeHtml(String(p.peopleCount))}` : null,
    p.totalPriceLabel ? `Стоимость: ${escapeHtml(String(p.totalPriceLabel))}` : null,
  ].filter(Boolean);
  return rows.join('\n');
}

function bookingHtml(p: TemplatePayload): string {
  return `<p style="line-height:1.7;margin:0">${bookingLines(p).replaceAll('\n', '<br>')}</p>`;
}

type Renderer = (p: TemplatePayload) => RenderedMessage;

function siteUrlOf(p: TemplatePayload): string | undefined {
  return typeof p.siteUrl === 'string' ? p.siteUrl : undefined;
}

export const templates: Record<string, Renderer> = {
  booking_created: (p) => ({
    subject: 'Заявка на экскурсию принята',
    text: `🌿 <b>Заявка принята!</b>\n\n${bookingLines(p)}\n\nМы свяжемся с вами для подтверждения.`,
    html: wrap('Заявка принята!', `${bookingHtml(p)}<p>Мы свяжемся с вами для подтверждения.</p>`, siteUrlOf(p)),
  }),
  booking_confirmed: (p) => ({
    subject: 'Бронирование подтверждено',
    text: `✅ <b>Бронирование подтверждено!</b>\n\n${bookingLines(p)}\n\nЖдём вас! Если планы изменятся — напишите нам.`,
    html: wrap('Бронирование подтверждено!', `${bookingHtml(p)}<p>Ждём вас! Если планы изменятся — напишите нам.</p>`, siteUrlOf(p)),
  }),
  booking_cancelled: (p) => ({
    subject: 'Бронирование отменено',
    text: `❌ <b>Бронирование отменено</b>\n\n${bookingLines(p)}${p.comment ? `\n\nКомментарий: ${escapeHtml(String(p.comment))}` : ''}\n\nБудем рады видеть вас в другой раз.`,
    html: wrap('Бронирование отменено', `${bookingHtml(p)}${p.comment ? `<p>Комментарий: ${escapeHtml(String(p.comment))}</p>` : ''}`, siteUrlOf(p)),
  }),
  booking_completed: (p) => ({
    subject: 'Спасибо за прогулку!',
    text: `💛 <b>Спасибо, что гуляли с нами!</b>\n\n${p.tourTitle ? `«${escapeHtml(String(p.tourTitle))}» — надеемся, вам понравилось.` : ''}\nБудем благодарны за отзыв на сайте.`,
    html: wrap('Спасибо за прогулку!', `<p>${p.tourTitle ? `«${escapeHtml(String(p.tourTitle))}» — надеемся, вам понравилось.` : ''}<br>Будем благодарны за отзыв на сайте.</p>`, siteUrlOf(p)),
  }),
  booking_reminder: (p) => ({
    subject: 'Напоминание: завтра экскурсия',
    text: `⏰ <b>Напоминаем: завтра экскурсия!</b>\n\n${bookingLines(p)}\n\nДо встречи!`,
    html: wrap('Завтра экскурсия!', `${bookingHtml(p)}<p>До встречи!</p>`, siteUrlOf(p)),
  }),
  admin_new_booking: (p) => ({
    subject: 'Новая заявка на бронирование',
    text: `🆕 <b>Новая заявка</b>\n\n${bookingLines(p)}\nКлиент: ${escapeHtml(String(p.contactName ?? '—'))}, ${escapeHtml(String(p.contactPhone ?? '—'))}${p.comment ? `\nКомментарий: ${escapeHtml(String(p.comment))}` : ''}\n\nПодтвердите в админке.`,
    html: wrap('Новая заявка', bookingHtml(p)),
  }),
  admin_booking_cancelled: (p) => ({
    subject: 'Клиент отменил бронирование',
    text: `↩️ <b>Клиент отменил бронь</b>\n\n${bookingLines(p)}${p.comment ? `\nПричина: ${escapeHtml(String(p.comment))}` : ''}`,
    html: wrap('Клиент отменил бронь', bookingHtml(p)),
  }),
  admin_new_request: (p) => ({
    subject: 'Новое сообщение с формы обратной связи',
    text: `✉️ <b>Сообщение с сайта</b>\n\nОт: ${escapeHtml(String(p.contactName ?? '—'))}${p.contactPhone ? `, ${escapeHtml(String(p.contactPhone))}` : ''}\n\n${escapeHtml(String(p.message ?? ''))}`,
    html: wrap('Сообщение с сайта', `<p>${escapeHtml(String(p.message ?? ''))}</p>`),
  }),
};

export function renderTemplate(template: string, payload: TemplatePayload): RenderedMessage {
  const renderer = templates[template];
  if (!renderer) {
    const safe = escapeHtml(JSON.stringify(payload));
    return {
      subject: 'Уведомление',
      text: safe,
      html: wrap('Уведомление', `<pre>${safe}</pre>`),
    };
  }
  return renderer(payload);
}
