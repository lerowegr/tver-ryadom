'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { Card, Loading, QueryError } from '@/components/ui';
import { ChannelsSetup } from '@/components/channels-setup';
import { TelegramSetup } from '@/components/telegram-setup';

const contactFields = [
  { key: 'company.name', label: 'Название компании' },
  { key: 'contacts.phone', label: 'Телефон (+7XXXXXXXXXX)' },
  { key: 'contacts.email', label: 'Email' },
  { key: 'contacts.telegram', label: 'Ссылка Telegram' },
  { key: 'contacts.whatsapp', label: 'Ссылка WhatsApp' },
  { key: 'contacts.vk', label: 'Ссылка ВКонтакте' },
  { key: 'contacts.max', label: 'Ссылка MAX' },
];

const textFields = [
  { key: 'company.tagline', label: 'Слоган (заголовок главной)', rows: 2 },
  { key: 'home.subtitle', label: 'Подзаголовок главной страницы', rows: 3 },
  { key: 'about.intro', label: 'Вступление раздела «О компании»', rows: 4 },
];

interface TeamMember {
  name: string;
  role: string;
  text: string;
}

const defaultTeam: TeamMember[] = [
  { name: 'Егор', role: 'Основатель и гид', text: '' },
];

function parseTeam(raw: unknown): TeamMember[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((m) => typeof m === 'object' && m !== null)
      .map((m) => ({
        name: String((m as TeamMember).name ?? ''),
        role: String((m as TeamMember).role ?? ''),
        text: String((m as TeamMember).text ?? ''),
      }));
  }
  return defaultTeam;
}

type Message = { kind: 'ok' | 'error'; text: string } | null;

function messageBox(message: Message) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={`rounded-xl px-4 py-3 text-sm font-medium ${
        message.kind === 'ok' ? 'bg-surface-soft/60 text-ink-soft' : 'bg-transparent text-danger'
      }`}
    >
      {message.text}
    </p>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [formMessage, setFormMessage] = useState<Message>(null);
  const [teamMessage, setTeamMessage] = useState<Message>(null);
  const [team, setTeam] = useState<TeamMember[]>(defaultTeam);

  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => authFetch<Record<string, unknown>>('/admin/settings'),
  });

  useEffect(() => {
    if (settings.data && settings.data['about.team'] !== undefined) {
      setTeam(parseTeam(settings.data['about.team']));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (entries: Record<string, string>) =>
      authFetch('/admin/settings', { method: 'PUT', body: JSON.stringify({ entries }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-settings'] }),
  });

  const onSubmitMain = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage(null);
    const form = new FormData(event.currentTarget);
    const entries: Record<string, string> = {};
    for (const field of [...contactFields, ...textFields]) {
      entries[field.key] = String(form.get(field.key) ?? '').trim();
    }
    save.mutate(entries, {
      onSuccess: () => setFormMessage({ kind: 'ok', text: 'Настройки сохранены' }),
      onError: (err) =>
        setFormMessage({
          kind: 'error',
          text: err instanceof ApiRequestError ? err.message : 'Не удалось сохранить',
        }),
    });
  };

  const saveTeam = () => {
    setTeamMessage(null);
    const cleaned = team
      .map((m) => ({ name: m.name.trim(), role: m.role.trim(), text: m.text.trim() }))
      .filter((m) => m.name);
    save.mutate(
      { 'about.team': JSON.stringify(cleaned) },
      {
        onSuccess: () => setTeamMessage({ kind: 'ok', text: 'Команда обновлена — проверьте страницу «О компании»' }),
        onError: (err) =>
          setTeamMessage({
            kind: 'error',
            text: err instanceof ApiRequestError ? err.message : 'Не удалось сохранить',
          }),
      },
    );
  };

  const setMember = (index: number, patch: Partial<TeamMember>) => {
    setTeam((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  if (settings.isLoading) return <Loading />;
  if (settings.isError) {
    return <QueryError error={settings.error} retry={() => settings.refetch()} />;
  }

  const str = (key: string) => {
    const value = settings.data?.[key];
    return typeof value === 'string' ? value : '';
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-display text-ink text-[1.75rem] leading-tight">Настройки сайта</h1>

      <TelegramSetup />
      <ChannelsSetup
        apiOrigin={(process.env.NEXT_PUBLIC_API_URL ?? '').replace(new RegExp('/api/v1$'), '')}
      />

      <Card title="Контакты и тексты">
        <form onSubmit={onSubmitMain} className="space-y-4">
          {contactFields.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key} className="text-muted mb-1.5 block text-sm font-medium">
                {field.label}
              </label>
              <input id={field.key} name={field.key} defaultValue={str(field.key)} className="input" />
            </div>
          ))}
          {textFields.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key} className="text-muted mb-1.5 block text-sm font-medium">
                {field.label}
              </label>
              <textarea
                id={field.key}
                name={field.key}
                rows={field.rows}
                defaultValue={str(field.key)}
                className="input"
              />
            </div>
          ))}
          {messageBox(formMessage)}
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Card>

      <Card
        title="Команда (раздел «О компании»)"
        action={
          <button
            onClick={() => setTeam((prev) => [...prev, { name: '', role: '', text: '' }])}
            className="btn-secondary"
          >
            + Человек
          </button>
        }
      >
        <div className="space-y-4">
          {team.map((member, index) => (
            <div key={index} className="bg-surface-soft space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  placeholder="Имя"
                  value={member.name}
                  onChange={(e) => setMember(index, { name: e.target.value })}
                  className="input"
                  aria-label={`Имя участника ${index + 1}`}
                />
                <input
                  placeholder="Роль (например, Гид-краевед)"
                  value={member.role}
                  onChange={(e) => setMember(index, { role: e.target.value })}
                  className="input"
                  aria-label={`Роль участника ${index + 1}`}
                />
                <button
                  onClick={() => setTeam((prev) => prev.filter((_, i) => i !== index))}
                  className="btn-danger !px-3"
                  aria-label={`Удалить участника ${index + 1}`}
                >
                  ✕
                </button>
              </div>
              <textarea
                placeholder="Пара фраз о человеке"
                rows={2}
                value={member.text}
                onChange={(e) => setMember(index, { text: e.target.value })}
                className="input"
                aria-label={`Описание участника ${index + 1}`}
              />
            </div>
          ))}
          {team.length === 0 ? (
            <p className="text-muted text-sm">Команда пуста — на сайте покажется стандартный состав.</p>
          ) : null}
          {messageBox(teamMessage)}
          <button onClick={saveTeam} disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Сохраняем…' : 'Сохранить команду'}
          </button>
        </div>
      </Card>
    </div>
  );
}
