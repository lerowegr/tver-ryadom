'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OutboxStatus, Paginated } from '@tver/shared';
import { useState } from 'react';
import { authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminOutboxItem } from '@/lib/types';
import { Card, Empty, Loading, QueryError, Tabs } from '@/components/ui';

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
};

export default function OutboxPage() {
  const [status, setStatus] = useState<OutboxStatus>('failed');
  const queryClient = useQueryClient();

  const outbox = useQuery({
    queryKey: ['admin-outbox', status],
    queryFn: () => authFetch<Paginated<AdminOutboxItem>>(`/admin/outbox?limit=50&status=${status}`),
  });

  const retry = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/outbox/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-outbox'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-[1.75rem] leading-tight">Уведомления</h1>
      <p className="text-muted max-w-[70ch] text-sm leading-relaxed">
        Очередь доставки в Telegram и на email. Недоставленные — здесь с причиной;
        кнопка возвращает задачу в очередь с нуля попыток.
      </p>

      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'failed' as const, label: 'Не доставлены' },
          { value: 'pending' as const, label: 'В очереди' },
          { value: 'sent' as const, label: 'Доставленные' },
        ]}
        label="Фильтр очереди по статусу"
      />

      {outbox.isLoading ? (
        <Loading />
      ) : outbox.isError ? (
        <QueryError error={outbox.error} retry={() => outbox.refetch()} />
      ) : (outbox.data?.items.length ?? 0) === 0 ? (
        <Card>
          <Empty
            text={
              status === 'failed'
                ? 'Недоставленных нет — всё уходит'
                : status === 'pending'
                  ? 'Очередь пуста'
                  : 'Пока ничего не доставлено'
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {outbox.data?.items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ink font-medium">
                    {CHANNEL_LABELS[item.channel] ?? item.channel} → {item.recipient}
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    {[item.template, `попыток: ${item.attempts}`, formatDateTime(item.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {item.status === 'failed' ? (
                  <button
                    onClick={() => retry.mutate(item.id)}
                    disabled={retry.isPending}
                    className="btn-primary !px-4 !py-2 text-xs"
                  >
                    Повторить
                  </button>
                ) : null}
              </div>
              {item.lastError ? (
                <p className="border-danger text-danger mt-3 border-l-2 py-1 pl-3 text-xs">
                  {item.lastError}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
