import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';
import { validationError } from '../lib/errors';

type Target = 'json' | 'query' | 'param';

/** Обёртка над zValidator: ошибки zod — в единый конверт ApiErrorBody. */
export function validate<T extends ZodSchema, Tg extends Target>(target: Tg, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '_';
        details[path] ??= issue.message;
      }
      throw validationError('Проверьте правильность заполнения полей', details);
    }
  });
}
