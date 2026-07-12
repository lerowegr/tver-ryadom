import { formatPrice } from '@tver/shared';

export { formatPrice };

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(value: string | Date | null): string {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}
