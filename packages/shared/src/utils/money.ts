/**
 * Все денежные суммы в системе хранятся в копейках (минорных единицах),
 * чтобы избежать ошибок округления и быть готовыми к интеграции ЮKassa.
 */

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

export function kopecksToRubles(kopecks: number): number {
  return kopecks / 100;
}

export function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

/** 120000 → «1 200 ₽» */
export function formatPrice(kopecks: number): string {
  return rubFormatter.format(kopecksToRubles(kopecks));
}

/** 90 → «1,5 часа», 210 → «3,5 часа», 60 → «1 час» */
export function formatDuration(minutes: number): string {
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} ${pluralHours(hours)}`;
  }
  const rounded = Math.round(hours * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${pluralHours(rounded)}`;
}

function pluralHours(hours: number): string {
  const whole = Math.floor(hours);
  if (!Number.isInteger(hours)) return 'часа';
  const mod10 = whole % 10;
  const mod100 = whole % 100;
  if (mod10 === 1 && mod100 !== 11) return 'час';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'часа';
  return 'часов';
}
