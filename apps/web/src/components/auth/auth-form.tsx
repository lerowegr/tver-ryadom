'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers';
import { ApiRequestError } from '@/lib/api';

type Mode = 'login' | 'register';

const inputCls =
  'w-full rounded-2xl border border-sand-300 bg-white px-4 py-3 text-sm text-ink-900 ' +
  'placeholder:text-bark-500/60 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500/20';

export function AuthForm() {
  const { status, login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/account';

  const [mode, setMode] = useState<Mode>('login');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (status === 'authed') router.replace(next);
  }, [status, router, next]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({
          name: String(form.get('name') ?? '').trim(),
          email,
          password,
          phone: String(form.get('phone') ?? '').trim() || undefined,
        });
      }
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setFieldErrors(err.details ?? {});
      } else {
        setError('Что-то пошло не так. Проверьте соединение и попробуйте ещё раз.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="glass shadow-soft w-full max-w-md rounded-[2rem] p-8 md:p-10">
      <h1 className="font-display text-ink-900 text-3xl font-semibold">
        {mode === 'login' ? 'С возвращением!' : 'Давайте знакомиться'}
      </h1>
      <p className="text-bark-700 mt-2 text-sm">
        {mode === 'login'
          ? 'Войдите, чтобы управлять бронированиями и избранным.'
          : 'Аккаунт хранит ваши брони, избранные маршруты и уведомления.'}
      </p>

      <div className="bg-cream-200 mt-6 flex rounded-full p-1" role="tablist" aria-label="Вход или регистрация">
        {(
          [
            ['login', 'Вход'],
            ['register', 'Регистрация'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
              setFieldErrors({});
            }}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              mode === value ? 'shadow-card text-ink-900 bg-white' : 'text-bark-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {mode === 'register' ? (
          <div>
            <label htmlFor="auth-name" className="sr-only">
              Имя
            </label>
            <input id="auth-name" name="name" placeholder="Ваше имя" required className={inputCls} />
            {fieldErrors.name ? (
              <p className="text-terra-700 mt-1.5 text-xs font-medium">{fieldErrors.name}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="auth-email" className="sr-only">
            Email
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            className={inputCls}
          />
          {fieldErrors.email ? (
            <p className="text-terra-700 mt-1.5 text-xs font-medium">{fieldErrors.email}</p>
          ) : null}
        </div>

        {mode === 'register' ? (
          <div>
            <label htmlFor="auth-phone" className="sr-only">
              Телефон
            </label>
            <input
              id="auth-phone"
              name="phone"
              type="tel"
              placeholder="Телефон (необязательно)"
              autoComplete="tel"
              className={inputCls}
            />
            {fieldErrors.phone ? (
              <p className="text-terra-700 mt-1.5 text-xs font-medium">{fieldErrors.phone}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="auth-password" className="sr-only">
            Пароль
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            placeholder={mode === 'register' ? 'Пароль (от 8 символов)' : 'Пароль'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'register' ? 8 : 1}
            className={inputCls}
          />
          {fieldErrors.password ? (
            <p className="text-terra-700 mt-1.5 text-xs font-medium">{fieldErrors.password}</p>
          ) : null}
        </div>

        {error ? (
          <p className="bg-terra-500/10 text-terra-700 rounded-2xl px-4 py-3 text-sm font-medium" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || status === 'loading'}
          className="bg-terra-500 shadow-soft hover:bg-terra-600 w-full rounded-full py-3.5 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>

      {mode === 'login' ? (
        <p className="text-bark-600 mt-5 text-center text-xs leading-relaxed">
          Забыли пароль? <Link href="/contacts" className="text-terra-600 font-semibold hover:underline">Напишите нам</Link> —
          восстановление по email появится вместе с уведомлениями.
        </p>
      ) : (
        <p className="text-bark-600 mt-5 text-center text-xs leading-relaxed">
          Регистрируясь, вы соглашаетесь на обработку персональных данных для оформления бронирований.
        </p>
      )}
    </div>
  );
}
