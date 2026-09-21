import { formatPrice } from '@tver/shared';

export { formatPrice };

/**
 * Время экскурсий — московское, и в админке тоже.
 *
 * Иначе из поездки в другой пояс расписание выглядело бы сдвинутым,
 * а перепутать час встречи с гостем — самая дорогая ошибка здесь.
 */
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export function formatDateTime(value: string | Date | null): string {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}
