'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers';
import { TelegramIcon } from '@/components/ui/icons';
import { ApiRequestError } from '@/lib/api';
import { authFetch } from '@/lib/auth';
import type { PublicUserDto } from '@/lib/types';

type TelegramLink = { available: false } | { available: true; url: string };

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
      <section className="border-line border p-8 md:p-10" aria-labelledby="profile-data">
        <h2 id="profile-data" className="text-ink mb-1 text-lg font-medium">
          Личные данные
        </h2>
        <p className="text-muted mb-6 text-sm">
          {user.email}
          {user.emailVerified ? (
            <span className="text-ink ml-2 text-xs font-medium">✓ подтверждён</span>
          ) : (
            <span className="text-faint ml-2 text-xs">подтверждение придёт с email-уведомлениями</span>
          )}
        </p>
        <form onSubmit={saveProfile} className="max-w-md space-y-4">
          <div>
            <label htmlFor="pf-name" className="field-label">
              Имя
            </label>
            <input id="pf-name" name="name" defaultValue={user.name} required className="field" />
          </div>
          <div>
            <label htmlFor="pf-phone" className="field-label">
              Телефон
            </label>
            <input
              id="pf-phone"
              name="phone"
              type="tel"
              defaultValue={user.phone ?? ''}
              placeholder="+7 900 123-45-67"
              className="field"
            />
          </div>
          {profile.message ? (
            <p
              role="status"
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                profile.message.kind === 'ok'
                  ? 'border-ink text-ink border-l-2 pl-4'
                  : 'border-danger text-danger border-l-2 pl-4'
              }`}
            >
              {profile.message.text}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={profile.pending}
            className="bg-ink text-bg hover:bg-ink-soft cursor-pointer px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 disabled:opacity-40"
          >
            {profile.pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </section>

      <section className="border-line border p-8 md:p-10" aria-labelledby="profile-tg">
        <h2 id="profile-tg" className="text-ink mb-2 flex items-center gap-2 text-lg font-medium">
          <TelegramIcon className="text-ink h-5 w-5" /> Уведомления в Telegram
        </h2>
        {user.telegramLinked ? (
          <p className="text-muted text-sm">
            <span className="text-ink font-medium">✓ Подключено.</span> Подтверждения броней
            и напоминания приходят в Telegram.
          </p>
        ) : (
          <div>
            <p className="text-muted mb-4 text-sm">
              Привяжите Telegram, чтобы получать подтверждения броней и напоминания за сутки до
              экскурсии.
            </p>
            <button
              onClick={async () => {
                try {
                  const link = await authFetch<TelegramLink>('/auth/telegram-link');
                  if (link.available) window.open(link.url, '_blank', 'noopener');
                  else profile.setMessage({ kind: 'error', text: 'Бот ещё не подключён — загляните позже' });
                } catch {
                  profile.setMessage({ kind: 'error', text: 'Не удалось получить ссылку привязки' });
                }
              }}
              className="bg-ink text-bg hover:bg-ink-soft inline-flex cursor-pointer items-center gap-2 px-7 py-3.5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
            >
              <TelegramIcon className="h-4 w-4" /> Привязать Telegram
            </button>
            <p className="text-faint mt-3 text-xs">
              Откроется чат с ботом — нажмите в нём «Start». Статус обновится после следующего входа.
            </p>
          </div>
        )}
      </section>

      <section className="border-line border p-8 md:p-10" aria-labelledby="profile-pass">
        <h2 id="profile-pass" className="text-ink mb-6 text-lg font-medium">
          Смена пароля
        </h2>
        <form onSubmit={changePassword} className="max-w-md space-y-4">
          <div>
            <label htmlFor="pf-cur" className="field-label">
              Текущий пароль
            </label>
            <input
              id="pf-cur"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="field"
            />
          </div>
          <div>
            <label htmlFor="pf-new" className="field-label">
              Новый пароль
            </label>
            <input
              id="pf-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="field"
            />
          </div>
          {password.message ? (
            <p
              role="status"
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                password.message.kind === 'ok'
                  ? 'border-ink text-ink border-l-2 pl-4'
                  : 'border-danger text-danger border-l-2 pl-4'
              }`}
            >
              {password.message.text}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={password.pending}
            className="border-line text-ink hover:border-ink hover:bg-ink hover:text-bg cursor-pointer border px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 disabled:opacity-40"
          >
            {password.pending ? 'Меняем…' : 'Изменить пароль'}
          </button>
        </form>
      </section>
    </div>
  );
}
