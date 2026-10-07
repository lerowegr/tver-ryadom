'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { normalizeRuPhone } from '@tver/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckIcon } from '@/components/ui/icons';
import { Turnstile } from '@/components/security/turnstile';
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

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cfToken, setCfToken] = useState<string | null>(null);
  const [cfReset, setCfReset] = useState(0);

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
        cfToken: cfToken ?? undefined,
      });
      setSent(true);
    } catch (error) {
      // Токен капчи одноразовый — после любой отправки виджет сбрасывается.
      setCfReset((n) => n + 1);
      setCfToken(null);
      setSubmitError(
        error instanceof ApiRequestError
          ? error.message
          : 'Не удалось отправить сообщение. Напишите нам в мессенджер.',
      );
    }
  });

  if (sent) {
    return (
      <div className="border-line border-t py-14 text-center" role="status">
        <span className="icon-tile mx-auto mb-7">
          <CheckIcon className="h-5 w-5" />
        </span>
        <h3 className="font-display text-ink text-2xl">Сообщение отправлено</h3>
        <p className="text-muted mt-4 text-sm">Отвечу в ближайшее время — обычно в течение пары часов.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-7">
      <div>
        <label htmlFor="cf-name" className="sr-only">
          Имя
        </label>
        <input
          id="cf-name"
          placeholder="Ваше имя"
          autoComplete="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'cf-name-error' : undefined}
          {...register('name')}
          className="field"
        />
        {errors.name ? (
          <p id="cf-name-error" className="field-error">
            {errors.name.message}
          </p>
        ) : null}
      </div>
      <div className="grid gap-7 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-phone" className="sr-only">
            Телефон
          </label>
          <input
            id="cf-phone"
            type="tel"
            placeholder="Телефон"
            autoComplete="tel"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? 'cf-phone-error' : undefined}
            {...register('phone')}
            className="field"
          />
          {errors.phone ? (
            <p id="cf-phone-error" className="field-error">
              {errors.phone.message}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="cf-email" className="sr-only">
            Email
          </label>
          <input
            id="cf-email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'cf-email-error' : undefined}
            {...register('email')}
            className="field"
          />
          {errors.email ? (
            <p id="cf-email-error" className="field-error">
              {errors.email.message}
            </p>
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
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'cf-message-error' : undefined}
          {...register('message')}
          className="field"
        />
        {errors.message ? (
          <p id="cf-message-error" className="field-error">
            {errors.message.message}
          </p>
        ) : null}
      </div>

      {submitError ? (
        <p className="border-danger text-danger border-l-2 py-2 pl-4 text-sm" role="alert">
          {submitError}
        </p>
      ) : null}

      <Turnstile onToken={setCfToken} resetKey={cfReset} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-ink text-bg hover:bg-ink-soft mt-4 cursor-pointer px-10 py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40"
      >
        {isSubmitting ? 'Отправляем…' : 'Отправить сообщение'}
      </button>
    </form>
  );
}
