import { z } from 'zod';
import { captchaTokenSchema, emailSchema, phoneSchema } from './common';

export const contactRequestSchema = z
  .object({
    name: z.string().trim().min(2, 'Укажите имя').max(100),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    message: z.string().trim().min(5, 'Напишите сообщение').max(3000),
    cfToken: captchaTokenSchema,
  })
  .refine((data) => data.phone || data.email, {
    message: 'Укажите телефон или email для связи',
    path: ['phone'],
  });

export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
