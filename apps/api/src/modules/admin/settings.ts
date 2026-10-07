import { settings } from '@tver/db';
import { normalizeRuPhone } from '@tver/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { validationError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const updateSchema = z.object({
  // до 8000 символов: сюда входит JSON команды раздела «О компании»
  entries: z.record(z.string().min(1).max(100), z.string().max(8000)),
});

/**
 * Ключи, которые разрешено править через общий PUT (P1/M5).
 * Внутренние секреты (`telegram.*`, `vk.*`, `max.*`, `calendar.*`) меняются
 * только через свои эндпоинты и никогда не отдаются целиком в GET.
 */
const EDITABLE_KEYS = new Set([
  'company.name',
  'company.tagline',
  'contacts.phone',
  'contacts.email',
  'contacts.telegram',
  'contacts.max',
  'contacts.vk',
  'home.subtitle',
  'about.intro',
  'about.team',
  'schedule.intro',
]);

const SECRET_KEYS = new Set([
  'telegram.webhookSecret',
  'vk.secret',
  'max.secret',
  'calendar.feedToken',
]);

function checkValue(key: string, value: string): void {
  if (key === 'contacts.telegram' || key === 'contacts.max' || key === 'contacts.vk') {
    if (value.trim() !== '' && !/^https?:\/\/[^\s"'<>]+$/i.test(value.trim())) {
      throw validationError(`Некорректная ссылка в поле ${key}`);
    }
  }
  if (key === 'contacts.email' && value.trim() !== '' && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value.trim())) {
    throw validationError('Некорректный email в контактах');
  }
  if (key === 'contacts.phone' && value.trim() !== '' && !normalizeRuPhone(value)) {
    throw validationError('Некорректный телефон в контактах');
  }
  if (key === 'about.team' && value.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('not-array');
    } catch {
      throw validationError('Поле about.team должно быть JSON-массивом');
    }
  }
}

export const adminSettingsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.get('db').select().from(settings);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      // Секреты наружу не отдаём даже админке целиком: только факт наличия.
      if (SECRET_KEYS.has(row.key)) {
        result[row.key] = { secretSet: true };
        continue;
      }
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return ok(c, result);
  })

  .put('/', validate('json', updateSchema), async (c) => {
    const { entries } = c.req.valid('json');
    const db = c.get('db');
    for (const [key, value] of Object.entries(entries)) {
      if (!EDITABLE_KEYS.has(key)) {
        throw validationError(`Ключ ${key} меняется только через свой раздел настроек`);
      }
      checkValue(key, value);
      await db
        .insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: JSON.stringify(value), updatedAt: new Date() },
        });
    }
    return ok(c, { saved: Object.keys(entries).length });
  });
