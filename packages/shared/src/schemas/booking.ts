import { z } from 'zod';
import { BOOKING_STATUSES } from '../constants/statuses';
import { captchaTokenSchema, emailSchema, idSchema, paginationSchema, phoneSchema } from './common';

export const bookingCreateSchema = z
  .object({
    tourId: idSchema,
    /** Бронь на конкретный слот расписания… */
    scheduleId: idSchema.optional(),
    /** …или заявка на желаемую дату (ISO), если подходящего слота нет. */
    desiredDate: z.coerce.date().optional(),
    peopleCount: z.number().int().min(1, 'Минимум 1 участник').max(50),
    contactName: z.string().trim().min(2, 'Укажите имя').max(100),
    contactPhone: phoneSchema,
    contactEmail: emailSchema.optional(),
    comment: z.string().trim().max(2000).optional(),
    cfToken: captchaTokenSchema,
  })
  .refine((data) => data.scheduleId || data.desiredDate, {
    message: 'Выберите дату из расписания или укажите желаемую дату',
    path: ['scheduleId'],
  });

export const bookingCancelSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const bookingAdminUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  adminComment: z.string().trim().max(2000).optional(),
});

export const bookingListFilterSchema = paginationSchema.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  tourId: idSchema.optional(),
  // Не z.coerce.boolean(): строка "false" в query-параметрах превратилась бы в true.
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type BookingAdminUpdateInput = z.infer<typeof bookingAdminUpdateSchema>;
export type BookingListFilterInput = z.infer<typeof bookingListFilterSchema>;
