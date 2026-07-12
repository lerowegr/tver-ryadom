/** Приводит российский номер к формату +7XXXXXXXXXX; возвращает null, если это не номер РФ. */
export function normalizeRuPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }
  return null;
}

/** +79001234567 → «+7 900 123-45-67» */
export function formatRuPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
}
