import { z } from 'zod';

/**
 * Занятость экскурсовода: дни и часы, когда записаться нельзя.
 *
 * Отпуск, отъезд, уже проданная экскурсия на Спутнике или Авито — всё это
 * закрывается здесь, и форма бронирования такие даты просто не предлагает.
 *
 * Время хранится как местное московское «стенное»: «29 октября, 14:00» —
 * это 14:00 в Твери независимо от того, где находится браузер гостя и в
 * каком поясе считает воркер. Метки времени тут только запутали бы.
 */

/** Дата по московскому времени: ГГГГ-ММ-ДД. */
export const mskDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД');

/** Время по московскому времени: ЧЧ:ММ. */
export const mskTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время в формате ЧЧ:ММ');

export const availabilityRangeSchema = z
  .object({ from: mskDateSchema, to: mskDateSchema })
  .refine((v) => v.to >= v.from, { message: 'Конец периода раньше начала', path: ['to'] });

/**
 * Закрытие периода. Один запрос закрывает сразу несколько дней: отпуск
 * набирать по одному дню было бы издевательством.
 */
export const availabilityBlockCreateSchema = z
  .object({
    from: mskDateSchema,
    to: mskDateSchema,
    /** Пусто в обоих полях — закрыт весь день. */
    startTime: mskTimeSchema.optional(),
    endTime: mskTimeSchema.optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.to >= v.from, { message: 'Конец периода раньше начала', path: ['to'] })
  .refine((v) => Boolean(v.startTime) === Boolean(v.endTime), {
    message: 'Укажите и начало, и конец промежутка — либо закройте весь день',
    path: ['endTime'],
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'Конец промежутка раньше начала',
    path: ['endTime'],
  });

export type AvailabilityRangeInput = z.infer<typeof availabilityRangeSchema>;
export type AvailabilityBlockCreateInput = z.infer<typeof availabilityBlockCreateSchema>;
