'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatRuPhone, type ContactRequestStatus, type Paginated } from '@tver/shared';
import { useState } from 'react';
import { authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminContactRequest } from '@/lib/types';
import { Card, Empty, Loading } from '@/components/ui';

export default function RequestsPage() {
  const [status, setStatus] = useState<ContactRequestStatus>('new');
  const queryClient = useQueryClient();

  const requests = useQuery({
    queryKey: ['admin-requests', status],
    queryFn: () =>
      authFetch<Paginated<AdminContactRequest>>(`/admin/contact-requests?limit=50&status=${status}`),
  });

  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ContactRequestStatus }) =>
      authFetch(`/admin/contact-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-ink-900 text-2xl font-bold">Заявки с формы</h1>

      <div className="bg-cream-200 inline-flex rounded-full p-1" role="tablist">
        {(
          [
            ['new', 'Новые'],
            ['processed', 'Обработанные'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={status === key}
            onClick={() => setStatus(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === key ? 'shadow-card text-ink-900 bg-white' : 'text-bark-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {requests.isLoading ? (
        <Loading />
      ) : (requests.data?.items.length ?? 0) === 0 ? (
        <Card>
          <Empty text={status === 'new' ? 'Новых заявок нет' : 'Обработанных заявок нет'} />
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.data?.items.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ink-900 font-bold">{request.name}</p>
                  <p className="text-bark-600 mt-0.5 text-xs">
                    {[
                      request.phone ? formatRuPhone(request.phone) : null,
                      request.email,
                      formatDateTime(request.createdAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {status === 'new' ? (
                  <button
                    onClick={() => update.mutate({ id: request.id, next: 'processed' })}
                    disabled={update.isPending}
                    className="btn-primary !px-4 !py-2 text-xs"
                  >
                    Обработано
                  </button>
                ) : (
                  <button
                    onClick={() => update.mutate({ id: request.id, next: 'new' })}
                    disabled={update.isPending}
                    className="btn-secondary !px-4 !py-2 text-xs"
                  >
                    Вернуть в новые
                  </button>
                )}
              </div>
              <p className="text-bark-800 mt-3 text-sm leading-relaxed">{request.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
