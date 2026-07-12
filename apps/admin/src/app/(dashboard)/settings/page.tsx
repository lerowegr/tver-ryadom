'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { Card, Loading } from '@/components/ui';

const fields = [
  { key: 'company.name', label: 'Название компании' },
  { key: 'company.tagline', label: 'Слоган (hero главной страницы)' },
  { key: 'contacts.phone', label: 'Телефон (+7XXXXXXXXXX)' },
  { key: 'contacts.email', label: 'Email' },
  { key: 'contacts.telegram', label: 'Ссылка Telegram' },
  { key: 'contacts.whatsapp', label: 'Ссылка WhatsApp' },
  { key: 'contacts.vk', label: 'Ссылка ВКонтакте' },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => authFetch<Record<string, string>>('/admin/settings'),
  });

  const save = useMutation({
    mutationFn: (entries: Record<string, string>) =>
      authFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ entries }) }),
    onSuccess: () => {
      setMessage({ kind: 'ok', text: 'Настройки сохранены' });
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (err) =>
      setMessage({
        kind: 'error',
        text: err instanceof ApiRequestError ? err.message : 'Не удалось сохранить',
      }),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entries: Record<string, string> = {};
    for (const field of fields) {
      entries[field.key] = String(form.get(field.key) ?? '').trim();
    }
    save.mutate(entries);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-ink-900 text-2xl font-bold">Настройки сайта</h1>
      <Card>
        {settings.isLoading ? (
          <Loading />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={field.key} className="text-bark-700 mb-1.5 block text-sm font-medium">
                  {field.label}
                </label>
                <input
                  id={field.key}
                  name={field.key}
                  defaultValue={settings.data?.[field.key] ?? ''}
                  className="input"
                />
              </div>
            ))}
            {message ? (
              <p
                role="status"
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  message.kind === 'ok' ? 'bg-sand-200/60 text-bark-800' : 'bg-terra-500/10 text-terra-700'
                }`}
              >
                {message.text}
              </p>
            ) : null}
            <button type="submit" disabled={save.isPending} className="btn-primary">
              {save.isPending ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
