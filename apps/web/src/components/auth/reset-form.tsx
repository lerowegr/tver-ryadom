'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/providers';
import { CheckIcon } from '@/components/ui/icons';
import { ApiRequestError, apiPost } from '@/lib/api';
import { setAccessToken, type SessionData } from '@/lib/auth';

export function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await apiPost<SessionData>('/auth/password-reset/confirm', { token, password });
      // Сервер сразу входит: refresh уже в куке, access кладём в память.
      setAccessToken(data.accessToken);
      setUser(data.user);
      setDone(true);
      setTimeout(() => router.replace('/account'), 1200);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Что-то пошло не так. Запросите новую ссылку.',
      );
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <div className="border-line w-full max-w-md border p-9 text-center md:p-12" role="alert">
        <h1 className="display text-[2rem]">Нет ссылки</h1>
        <p className="text-muted mt-4 text-sm leading-relaxed">
          Откройте письмо и перейдите по кнопке из него.
        </p>
        <p className="mt-7 text-center text-xs">
          <Link href="/auth/forgot" className="link-underline text-ink">
            Запросить новую ссылку
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="border-line w-full max-w-md border p-9 text-center md:p-12" role="status">
        <span className="icon-tile mx-auto mb-7">
          <CheckIcon className="h-5 w-5" />
        </span>
        <h1 className="display text-[2rem]">Готово!</h1>
        <p className="text-muted mt-4 text-sm">Пароль обновлён, входим в кабинет…</p>
      </div>
    );
  }

  return (
    <div className="border-line w-full max-w-md border p-9 md:p-12">
      <h1 className="display text-[2rem]">Новый пароль</h1>
      <p className="text-muted mt-4 text-sm leading-relaxed">
        Придумайте пароль от 8 символов. Старые сессии будут завершены.
      </p>
      <form onSubmit={onSubmit} className="mt-9 space-y-7" noValidate>
        <div>
          <label htmlFor="reset-password" className="sr-only">
            Новый пароль
          </label>
          <input
            id="reset-password"
            type="password"
            placeholder="Новый пароль (от 8 символов)"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </div>

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
          {pending ? 'Секунду…' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  );
}
