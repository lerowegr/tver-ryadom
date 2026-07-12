'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { normalizeRuPhone } from '@tver/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckIcon } from '@/components/ui/icons';
import { ApiRequestError, apiPost } from '@/lib/api';

const formSchema = z
  .object({
    name: z.string().trim().min(2, 'Укажите имя'),
    phone: z
      .string()
      .optional()
      .refine((v) => !v || normalizeRuPhone(v) !== null, 'Некорректный номер телефона'),
    email: z.string().email('Некорректный email').optional().or(z.literal('')),
    message: z.string().trim().min(5, 'Напишите сообщение').max(3000),
  })
  .refine((data) => data.phone || data.email, {
    message: 'Оставьте телефон или email, чтобы мы могли ответить',
    path: ['phone'],
  });

type FormValues = z.infer<typeof formSchema>;

const inputCls =
  'w-full rounded-2xl border border-sand-300 bg-white px-4 py-3 text-sm text-ink-900 ' +
  'placeholder:text-bark-500/60 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500/20';

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await apiPost('/contact', {
        name: values.name,
        phone: values.phone ? normalizeRuPhone(values.phone) : undefined,
        email: values.email || undefined,
        message: values.message,
      });
      setSent(true);
    } catch (error) {
      setSubmitError(
        error instanceof ApiRequestError
          ? error.message
          : 'Не удалось отправить сообщение. Напишите нам в мессенджер.',
      );
    }
  });

  if (sent) {
    return (
      <div className="py-8 text-center" role="status">
        <span className="bg-terra-500/10 text-terra-600 mx-auto mb-4 inline-flex rounded-full p-4">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h3 className="text-ink-900 font-display text-xl font-semibold">Сообщение отправлено</h3>
        <p className="text-bark-700 mt-2 text-sm">Ответим в ближайшее время — обычно в течение пары часов.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="cf-name" className="sr-only">
          Имя
        </label>
        <input id="cf-name" placeholder="Ваше имя" {...register('name')} className={inputCls} />
        {errors.name ? <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.name.message}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-phone" className="sr-only">
            Телефон
          </label>
          <input id="cf-phone" type="tel" placeholder="Телефон" {...register('phone')} className={inputCls} />
          {errors.phone ? (
            <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.phone.message}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="cf-email" className="sr-only">
            Email
          </label>
          <input id="cf-email" type="email" placeholder="Email" {...register('email')} className={inputCls} />
          {errors.email ? (
            <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.email.message}</p>
          ) : null}
        </div>
      </div>
      <div>
        <label htmlFor="cf-message" className="sr-only">
          Сообщение
        </label>
        <textarea
          id="cf-message"
          rows={4}
          placeholder="Расскажите, что вас интересует: даты, состав группы, особые пожелания…"
          {...register('message')}
          className={inputCls}
        />
        {errors.message ? (
          <p className="text-terra-700 mt-1.5 text-xs font-medium">{errors.message.message}</p>
        ) : null}
      </div>

      {submitError ? (
        <p className="bg-terra-500/10 text-terra-700 rounded-2xl px-4 py-3 text-sm font-medium" role="alert">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-terra-500 shadow-soft hover:bg-terra-600 rounded-full px-8 py-3.5 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {isSubmitting ? 'Отправляем…' : 'Отправить сообщение'}
      </button>
    </form>
  );
}
