'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers';
import { Turnstile } from '@/components/security/turnstile';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ApiRequestError } from '@/lib/api';

type Mode = 'login' | 'register';

/**
 * Куда можно вернуть после входа. Только внутренние пути без `//`,
 * обратных слешей и схем — иначе open-redirect на фишинг (M4).
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return '/account';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/account';
  if (raw.includes('\\')) return '/account';
  if (!/^\/[A-Za-z0-9\-_./?=&%#]*$/.test(raw)) return '/account';
  return raw;
}

export function AuthForm() {
  const { status, login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));

  const [mode, setMode] = useState<Mode>('login');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cfToken, setCfToken] = useState<string | null>(null);
  const [cfReset, setCfReset] = useState(0);

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
          cfToken: cfToken ?? undefined,
        });
      }
      router.replace(next);
    } catch (err) {
      setCfReset((n) => n + 1);
      setCfToken(null);
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
    <div className="border-line w-full max-w-md border p-9 md:p-12">
      <h1 className="display text-[2rem]">
        {mode === 'login' ? 'С возвращением!' : 'Давайте знакомиться'}
      </h1>
      <p className="text-muted mt-4 text-sm leading-relaxed">
        {mode === 'login'
          ? 'Войдите, чтобы управлять бронированиями и избранным.'
          : 'Аккаунт хранит ваши брони, избранные маршруты и уведомления.'}
      </p>

      <SegmentedTabs
        className="mt-6 flex w-full"
        ariaLabel="Вход или регистрация"
        value={mode}
        onChange={(value) => {
          setMode(value);
          setError(null);
          setFieldErrors({});
          setCfReset((n) => n + 1);
          setCfToken(null);
        }}
        options={[
          { value: 'login', label: 'Вход' },
          { value: 'register', label: 'Регистрация' },
        ]}
      />

      <form onSubmit={onSubmit} className="mt-9 space-y-7" noValidate>
        {/* Раскрытие на CSS-сетке: тот же эффект, что давал
            AnimatePresence, но без анимационной библиотеки. */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mode === 'register' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={mode !== 'register'}
        >
          <div className="overflow-hidden">
              <label htmlFor="auth-name" className="sr-only">
                Имя
              </label>
              <input
                id="auth-name"
                name="name"
                placeholder="Ваше имя"
                autoComplete="name"
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
                required
                /* Отключаем в свёрнутом виде: поле остаётся в DOM, и без этого
                   required не дал бы отправить форму входа. */
                disabled={mode !== 'register'}
                className="field"
              />
              {fieldErrors.name ? (
                <p id="auth-name-error" className="field-error">
                  {fieldErrors.name}
                </p>
              ) : null}
          </div>
        </div>

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
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
            required
            className="field"
          />
          {fieldErrors.email ? (
            <p id="auth-email-error" className="field-error">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        {/* Раскрытие на CSS-сетке: тот же эффект, что давал
            AnimatePresence, но без анимационной библиотеки. */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mode === 'register' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          aria-hidden={mode !== 'register'}
        >
          <div className="overflow-hidden">
              <label htmlFor="auth-phone" className="sr-only">
                Телефон
              </label>
              <input
                id="auth-phone"
                name="phone"
                type="tel"
                placeholder="Телефон (необязательно)"
                autoComplete="tel"
                aria-invalid={fieldErrors.phone ? true : undefined}
                aria-describedby={fieldErrors.phone ? 'auth-phone-error' : undefined}
                disabled={mode !== 'register'}
                className="field"
              />
              {fieldErrors.phone ? (
                <p id="auth-phone-error" className="field-error">
                  {fieldErrors.phone}
                </p>
              ) : null}
          </div>
        </div>

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
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
            minLength={mode === 'register' ? 8 : 1}
            className="field"
          />
          {fieldErrors.password ? (
            <p id="auth-password-error" className="field-error">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="border-danger text-danger border-l-2 py-2 pl-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {mode === 'register' ? <Turnstile onToken={setCfToken} resetKey={cfReset} /> : null}

        <button
          type="submit"
          disabled={pending || status === 'loading'}
          className="bg-ink text-bg hover:bg-ink-soft mt-4 w-full cursor-pointer py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40"
        >
          {pending ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>

      {mode === 'login' ? (
        <p className="text-muted mt-7 text-center text-xs leading-relaxed">
          Забыли пароль? <Link href="/auth/forgot" className="link-underline text-ink">Восстановите по email</Link>.
        </p>
      ) : (
        <p className="text-muted mt-7 text-center text-xs leading-relaxed">
          Регистрируясь, вы соглашаетесь на обработку персональных данных для оформления бронирований.
        </p>
      )}
    </div>
  );
}
