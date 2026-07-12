'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers';
import { ApiRequestError } from '@/lib/api';
import { authFetch } from '@/lib/auth';
import type { PublicUserDto } from '@/lib/types';

const inputCls =
  'w-full rounded-2xl border border-sand-300 bg-white px-4 py-3 text-sm text-ink-900 ' +
  'placeholder:text-bark-500/60 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500/20';

function useFormState() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  return { pending, setPending, message, setMessage };
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const profile = useFormState();
  const password = useFormState();

  if (!user) return null;

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    profile.setPending(true);
    profile.setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const updated = await authFetch<PublicUserDto>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          phone: String(form.get('phone') ?? '').trim() || null,
        }),
      });
      setUser(updated);
      profile.setMessage({ kind: 'ok', text: 'Данные сохранены' });
    } catch (error) {
      profile.setMessage({
        kind: 'error',
        text: error instanceof ApiRequestError ? error.message : 'Не удалось сохранить данные',
      });
    } finally {
      profile.setPending(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    password.setPending(true);
    password.setMessage(null);
    const form = new FormData(formEl);
    try {
      await authFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: String(form.get('currentPassword') ?? ''),
          newPassword: String(form.get('newPassword') ?? ''),
        }),
      });
      formEl.reset();
      password.setMessage({ kind: 'ok', text: 'Пароль изменён; другие устройства разлогинены' });
    } catch (error) {
      password.setMessage({
        kind: 'error',
        text: error instanceof ApiRequestError ? error.message : 'Не удалось изменить пароль',
      });
    } finally {
      password.setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="shadow-card rounded-3xl bg-white p-7 md:p-9" aria-labelledby="profile-data">
        <h2 id="profile-data" className="text-ink-900 mb-1 text-lg font-bold">
          Личные данные
        </h2>
        <p className="text-bark-600 mb-6 text-sm">
          {user.email}
          {user.emailVerified ? (
            <span className="text-terra-600 ml-2 text-xs font-semibold">✓ подтверждён</span>
          ) : (
            <span className="text-bark-500 ml-2 text-xs">подтверждение придёт с email-уведомлениями</span>
          )}
        </p>
        <form onSubmit={saveProfile} className="max-w-md space-y-4">
          <div>
            <label htmlFor="pf-name" className="text-bark-700 mb-1.5 block text-sm font-medium">
              Имя
            </label>
            <input id="pf-name" name="name" defaultValue={user.name} required className={inputCls} />
          </div>
          <div>
            <label htmlFor="pf-phone" className="text-bark-700 mb-1.5 block text-sm font-medium">
              Телефон
            </label>
            <input
              id="pf-phone"
              name="phone"
              type="tel"
              defaultValue={user.phone ?? ''}
              placeholder="+7 900 123-45-67"
              className={inputCls}
            />
          </div>
          {profile.message ? (
            <p
              role="status"
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                profile.message.kind === 'ok'
                  ? 'bg-sand-200/60 text-bark-800'
                  : 'bg-terra-500/10 text-terra-700'
              }`}
            >
              {profile.message.text}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={profile.pending}
            className="bg-terra-500 hover:bg-terra-600 rounded-full px-7 py-3 text-sm font-semibold text-white transition disabled:opacity-60"
          >
            {profile.pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </section>

      <section className="shadow-card rounded-3xl bg-white p-7 md:p-9" aria-labelledby="profile-pass">
        <h2 id="profile-pass" className="text-ink-900 mb-6 text-lg font-bold">
          Смена пароля
        </h2>
        <form onSubmit={changePassword} className="max-w-md space-y-4">
          <div>
            <label htmlFor="pf-cur" className="text-bark-700 mb-1.5 block text-sm font-medium">
              Текущий пароль
            </label>
            <input
              id="pf-cur"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="pf-new" className="text-bark-700 mb-1.5 block text-sm font-medium">
              Новый пароль
            </label>
            <input
              id="pf-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputCls}
            />
          </div>
          {password.message ? (
            <p
              role="status"
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                password.message.kind === 'ok'
                  ? 'bg-sand-200/60 text-bark-800'
                  : 'bg-terra-500/10 text-terra-700'
              }`}
            >
              {password.message.text}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={password.pending}
            className="border-bark-600/30 text-bark-800 hover:border-bark-600/60 rounded-full border bg-white px-7 py-3 text-sm font-semibold transition disabled:opacity-60"
          >
            {password.pending ? 'Меняем…' : 'Изменить пароль'}
          </button>
        </form>
      </section>
    </div>
  );
}
