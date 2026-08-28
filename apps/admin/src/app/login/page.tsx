'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/components/providers';
import { ApiRequestError } from '@/lib/api';

export default function LoginPage() {
  const { status, login } = useAdminAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authed') router.replace('/');
  }, [status, router]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await login(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : 'Не удалось войти',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white p-8">
        <p className="text-ink text-2xl font-medium">
          Тверь <span className="text-ink italic">рядом</span>
        </p>
        <p className="text-muted mt-1 mb-6 text-sm">Вход в административную панель</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-muted mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label htmlFor="password" className="text-muted mb-1.5 block text-sm font-medium">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>
          {error ? (
            <p className="bg-transparent text-danger px-4 py-3 text-sm font-medium" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className="btn-primary w-full justify-center">
            {pending ? 'Входим…' : 'Войти'}
          </button>
        </form>
        <p className="text-faint mt-4 text-xs leading-relaxed">
          Пароль администратора задаётся командой{' '}
          <code className="bg-surface-soft rounded px-1">pnpm --filter @tver/api admin:password</code>
        </p>
      </div>
    </div>
  );
}
