'use client';

import { useQuery } from '@tanstack/react-query';
import { formatRuPhone, type Paginated } from '@tver/shared';
import { useState } from 'react';
import { authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminUserRow } from '@/lib/types';
import { Card, Empty, Loading, QueryError, Table } from '@/components/ui';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

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
                  {u.role === 'admin' ? (
                    <span className="bg-transparent text-danger px-2.5 py-1 text-xs font-medium">
                      админ
                    </span>
                  ) : (
                    <span className="text-muted text-xs">клиент</span>
                  )}
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
