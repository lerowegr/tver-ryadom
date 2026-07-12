import { z } from 'zod';
import { normalizeRuPhone } from '../utils/phone';

export const idSchema = z.string().min(1, 'Не указан идентификатор');

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Слаг: строчные латинские буквы, цифры и дефисы');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Некорректный email');

export const phoneSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const normalized = normalizeRuPhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Некорректный номер телефона' });
      return z.NEVER;
    }
    return normalized;
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const coordinatesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
