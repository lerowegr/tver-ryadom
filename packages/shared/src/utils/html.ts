/**
 * Экранирование для HTML-контекстов (Telegram `parse_mode: HTML`, email-html).
 *
 * Храним сырьё в БД, чистим на рендере. Использовать везде, где в разметку
 * подставляются пользовательские или админские строки.
 */

/** `&<>"'` → сущности. Для вставок в текст и в двойные кавычки атрибутов. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** То же, но для URL в `href`: режет `javascript:`/`data:`/`vbscript:`. */
export function escapeHref(value: string): string {
  const trimmed = value.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
  return escapeHtml(trimmed);
}
