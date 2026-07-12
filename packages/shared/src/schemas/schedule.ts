import { z } from 'zod';
import { SCHEDULE_STATUSES } from '../constants/statuses';
import { idSchema } from './common';

export const scheduleCreateSchema = z.object({
  tourId: idSchema,
  startsAt: z.coerce.date(),
  capacity: z.number().int().min(1).max(200),
});

export const scheduleUpdateSchema = z.object({
  startsAt: z.coerce.date().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
});

export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;
