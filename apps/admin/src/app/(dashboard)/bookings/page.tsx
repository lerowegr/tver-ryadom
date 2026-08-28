'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS, formatRuPhone, type BookingStatus, type Paginated } from '@tver/shared';
import { useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { AdminBooking } from '@/lib/types';
import { BookingStatusPill, Card, Empty, Loading, QueryError, Table } from '@/components/ui';

const actions: { status: BookingStatus; label: string; needComment?: boolean }[] = [
  { status: 'confirmed', label: 'Подтвердить' },
  { status: 'completed', label: 'Завершить' },
  { status: 'cancelled', label: 'Отменить', needComment: true },
];

const allowed: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled', 'completed'],
  confirmed: ['cancelled', 'completed'],
  cancelled: [],
  completed: [],
};

export default function BookingsPage() {
  const [status, setStatus] = useState<BookingStatus | ''>('pending');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const bookings = useQuery({
    queryKey: ['admin-bookings', status],
    queryFn: () =>
      authFetch<Paginated<AdminBooking>>(`/admin/bookings?limit=50${status ? `&status=${status}` : ''}`),
  });

  const update = useMutation({
    mutationFn: ({ id, next, comment }: { id: string; next: BookingStatus; comment?: string }) =>
      authFetch(`/admin/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, adminComment: comment }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Не удалось обновить бронь'),
  });

  const act = (booking: AdminBooking, next: BookingStatus, needComment?: boolean) => {
    let comment: string | undefined;
    if (needComment) {
      const answer = window.prompt('Комментарий для клиента (необязательно):', '');
      if (answer === null) return;
      comment = answer || undefined;
    }
    update.mutate({ id: booking.id, next, comment });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-[1.75rem] leading-tight">Бронирования</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as BookingStatus | '')}
          className="input w-auto"
          aria-label="Фильтр по статусу"
        >
          <option value="">Все статусы</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="bg-transparent text-danger px-4 py-3 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        {bookings.isLoading ? (
          <Loading />
        ) : bookings.isError ? (
          <QueryError error={bookings.error} retry={() => bookings.refetch()} />
        ) : (bookings.data?.items.length ?? 0) === 0 ? (
          <Empty text="Броней с таким статусом нет" />
        ) : (
          <Table head={['Создана', 'Клиент', 'Экскурсия', 'Дата', 'Чел.', 'Сумма', 'Статус', 'Действия']}>
            {bookings.data?.items.map((b) => (
              <tr key={b.id} className="align-top">
                <td className="text-muted py-3 pr-4 text-xs whitespace-nowrap">
                  {formatDateTime(b.createdAt)}
                </td>
                <td className="py-3 pr-4">
                  <p className="font-medium">{b.contactName}</p>
                  <p className="text-muted text-xs whitespace-nowrap">{formatRuPhone(b.contactPhone)}</p>
                  {b.contactEmail ? <p className="text-muted text-xs">{b.contactEmail}</p> : null}
                  {b.comment ? <p className="text-faint mt-1 max-w-52 text-xs italic">«{b.comment}»</p> : null}
                </td>
                <td className="text-muted py-3 pr-4">{b.tour?.title ?? '—'}</td>
                <td className="text-muted py-3 pr-4 whitespace-nowrap">{formatDateTime(b.startsAt)}</td>
                <td className="text-muted py-3 pr-4">{b.peopleCount}</td>
                <td className="py-3 pr-4 font-medium whitespace-nowrap">{formatPrice(b.totalPrice)}</td>
                <td className="py-3 pr-4">
                  <BookingStatusPill status={b.status} />
                  {b.adminComment ? (
                    <p className="text-faint mt-1 max-w-40 text-xs">{b.adminComment}</p>
                  ) : null}
                </td>
                <td className="py-3">
                  <div className="flex flex-col gap-1.5">
                    {actions
                      .filter((a) => allowed[b.status].includes(a.status))
                      .map((a) => (
                        <button
                          key={a.status}
                          onClick={() => act(b, a.status, a.needComment)}
                          disabled={update.isPending}
                          className={a.status === 'cancelled' ? 'btn-danger !px-3 !py-1.5 text-xs' : 'btn-secondary !px-3 !py-1.5 text-xs'}
                        >
                          {a.label}
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
