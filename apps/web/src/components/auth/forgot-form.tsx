'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Turnstile } from '@/components/security/turnstile';
import { CheckIcon } from '@/components/ui/icons';
import { ApiRequestError, apiPost } from '@/lib/api';

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cfToken, setCfToken] = useState<string | null>(null);
  const [cfReset, setCfReset] = useState(0);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiPost('/auth/password-reset/request', { email: email.trim(), cfToken: cfToken ?? undefined });
      // Ответ всегда одинаковый — письмо придёт, только если email зарегистрирован.
      setSent(true);
    } catch (err) {
      setCfReset((n) => n + 1);
      setCfToken(null);
      setError(
        err instanceof ApiRequestError ? err.message : 'Что-то пошло не так. Попробуйте ещё раз.',
      );
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className="border-line w-full max-w-md border p-9 text-center md:p-12" role="status">
        <span className="icon-tile mx-auto mb-7">
          <CheckIcon className="h-5 w-5" />
        </span>
        <h1 className="display text-[2rem]">Проверьте почту</h1>
        <p className="text-muted mt-4 text-sm leading-relaxed">
          Если такой адрес зарегистрирован, письмо со ссылкой уже летит. Ссылка действует час.
        </p>
        <p className="mt-7 text-center text-xs">
          <Link href="/auth" className="link-underline text-ink">
            ← Вернуться ко входу
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="border-line w-full max-w-md border p-9 md:p-12">
      <h1 className="display text-[2rem]">Забыли пароль?</h1>
      <p className="text-muted mt-4 text-sm leading-relaxed">
        Оставьте email от аккаунта — пришлём ссылку для нового пароля.
      </p>
      <form onSubmit={onSubmit} className="mt-9 space-y-7" noValidate>
        <div>
          <label htmlFor="forgot-email" className="sr-only">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>

        <Turnstile onToken={setCfToken} resetKey={cfReset} />

        {error ? (
          <p className="border-danger text-danger border-l-2 py-2 pl-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="bg-ink text-bg hover:bg-ink-soft mt-4 w-full cursor-pointer py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 disabled:opacity-40"
        >
          {pending ? 'Секунду…' : 'Прислать ссылку'}
        </button>
      </form>
      <p className="mt-7 text-center text-xs">
        <Link href="/auth" className="link-underline text-ink">
          ← Вернуться ко входу
        </Link>
      </p>
    </div>
  );
}
