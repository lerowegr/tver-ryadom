import { z } from 'zod';
import { REVIEW_STATUSES } from '../constants/statuses';
import { captchaTokenSchema, idSchema, paginationSchema } from './common';

export const reviewCreateSchema = z.object({
  tourId: idSchema,
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(10, 'Отзыв должен быть не короче 10 символов').max(2000),
  /** Для отзывов без авторизации. */
  authorName: z.string().trim().min(2).max(100).optional(),
  cfToken: captchaTokenSchema,
});

export const reviewModerateSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
});

export const reviewListFilterSchema = paginationSchema.extend({
  tourId: idSchema.optional(),
  status: z.enum(REVIEW_STATUSES).optional(),
});

export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;
export type ReviewModerateInput = z.infer<typeof reviewModerateSchema>;
