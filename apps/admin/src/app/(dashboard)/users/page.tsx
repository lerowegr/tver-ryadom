'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatRuPhone, type Paginated } from '@tver/shared';
import { useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminUserRow } from '@/lib/types';
import { Card, Empty, Loading, QueryError, Table } from '@/components/ui';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const createAdmin = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      authFetch('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setAdding(false);
      setMessage({ ok: true, text: 'Сотрудник добавлен — доступ в панель открыт' });
      invalidate();
    },
    onError: (err) =>
      setMessage({
        ok: false,
        text: err instanceof ApiRequestError ? err.message : 'Не удалось создать пользователя',
      }),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'user' }) =>
      authFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => {
      setMessage(null);
      invalidate();
    },
    onError: (err) =>
      setMessage({
        ok: false,
        text: err instanceof ApiRequestError ? err.message : 'Не удалось изменить роль',
      }),
  });

  const onCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    createAdmin.mutate({
      email: String(form.get('email') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      role: 'admin',
    });
  };

  const users = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () =>
      authFetch<Paginated<AdminUserRow>>(
        `/admin/users?limit=50${query ? `&search=${encodeURIComponent(query)}` : ''}`,
      ),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-[1.75rem] leading-tight">Пользователи</h1>
        <button onClick={() => setAdding((v) => !v)} className="btn-secondary">
          {adding ? 'Отмена' : '+ Добавить сотрудника'}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя, email или телефон"
            className="input w-64"
            aria-label="Поиск пользователей"
          />
          <button type="submit" className="btn-secondary">
            Найти
          </button>
        </form>
      </div>

      {message ? (
        <p
          role="status"
          className={`border-l-2 py-2 pl-4 text-sm ${message.ok ? 'border-ink text-ink' : 'border-danger text-danger'}`}
        >
          {message.text}
        </p>
      ) : null}

      {adding ? (
        <Card title="Новый сотрудник">
          <p className="text-muted mb-5 text-sm leading-relaxed">
            Аккаунт сразу получает права администратора и доступ в эту панель. Пароль передайте
            человеку лично — восстановить его отсюда нельзя.
          </p>
          <form onSubmit={onCreate} className="max-w-md space-y-5">
            <label className="block">
              <span className="kicker-plain mb-2 block">Имя</span>
              <input name="name" required minLength={2} className="input" />
            </label>
            <label className="block">
              <span className="kicker-plain mb-2 block">Email</span>
              <input name="email" type="email" required className="input" />
            </label>
            <label className="block">
              <span className="kicker-plain mb-2 block">Пароль (от 10 символов)</span>
              <input name="password" type="password" required minLength={10} className="input" />
            </label>
            <button type="submit" disabled={createAdmin.isPending} className="btn-primary">
              {createAdmin.isPending ? 'Создаём…' : 'Создать доступ'}
            </button>
          </form>
        </Card>
      ) : null}

      <Card>
        {users.isLoading ? (
          <Loading />
        ) : users.isError ? (
          <QueryError error={users.error} retry={() => users.refetch()} />
        ) : (users.data?.items.length ?? 0) === 0 ? (
          <Empty text="Пользователи не найдены" />
        ) : (
          <Table head={['Имя', 'Email', 'Телефон', 'Роль', 'Броней', 'Telegram', 'Регистрация']}>
            {users.data?.items.map((u) => (
              <tr key={u.id}>
                <td className="py-3 pr-4 font-medium">{u.name}</td>
                <td className="text-muted py-3 pr-4">{u.email ?? '—'}</td>
                <td className="text-muted py-3 pr-4 whitespace-nowrap">
                  {u.phone ? formatRuPhone(u.phone) : '—'}
                </td>
                <td className="py-3 pr-4">
                  <button
                    onClick={() => changeRole.mutate({ id: u.id, role: u.role === 'admin' ? 'user' : 'admin' })}
                    disabled={changeRole.isPending}
                    title={u.role === 'admin' ? 'Снять права администратора' : 'Выдать права администратора'}
                    className="cursor-pointer disabled:opacity-40"
                  >
                  {u.role === 'admin' ? (
                    <span className="bg-transparent text-danger px-2.5 py-1 text-xs font-medium">
                      админ
                    </span>
                  ) : (
                    <span className="text-muted text-xs">клиент</span>
                  )}
                  </button>
                </td>
                <td className="text-muted py-3 pr-4">{u.bookingsCount}</td>
                <td className="text-muted py-3 pr-4">{u.telegramChatId ? '✓' : '—'}</td>
                <td className="text-muted py-3 text-xs whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
