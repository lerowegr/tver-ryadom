'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_STATUS_LABELS, type BookingStatus, type Paginated } from '@tver/shared';
import { useState } from 'react';
import { ClockIcon, UsersIcon } from '@/components/ui/icons';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ApiRequestError } from '@/lib/api';
import { authFetch } from '@/lib/auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { MyBookingDto } from '@/lib/types';

type Tab = 'upcoming' | 'past' | 'all';

const tabs: { key: Tab; label: string }[] = [
  { key: 'upcoming', label: 'Предстоящие' },
  { key: 'past', label: 'Прошедшие' },
  { key: 'all', label: 'Все' },
];

const statusStyles: Record<BookingStatus, string> = {
  pending: 'border-line text-muted border',
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'border-line text-faint border',
  completed: 'border-line text-muted border',
};

function queryFor(tab: Tab): string {
  if (tab === 'upcoming') return '&upcoming=true';
  if (tab === 'past') return '&upcoming=false';
  return '';
}

export default function BookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const bookings = useQuery({
    queryKey: ['bookings', tab],
    queryFn: () => authFetch<Paginated<MyBookingDto>>(`/bookings/my?limit=50${queryFor(tab)}`),
  });

  const cancel = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      authFetch(`/bookings/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: why || undefined }),
      }),
    onSuccess: () => {
      setCancelId(null);
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Не удалось отменить бронирование'),
  });

  const canCancel = (b: MyBookingDto) =>
    (b.status === 'pending' || b.status === 'confirmed') &&
    (!b.startsAt || new Date(b.startsAt).getTime() > Date.now());

  return (
    <div>
      <SegmentedTabs
        className="mb-6"
        ariaLabel="Фильтр броней"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({ value: t.key, label: t.label }))}
      />

      {bookings.isLoading ? (
        <p className="text-muted animate-pulse py-10 text-center">Загружаем брони…</p>
      ) : (bookings.data?.items.length ?? 0) === 0 ? (
        <div className="border-line border-t py-16 text-center">
          <p className="text-ink text-lg font-medium">Здесь пока пусто</p>
          <p className="text-muted mt-2 text-sm">
            {tab === 'upcoming' ? 'Нет предстоящих экскурсий — самое время выбрать!' : 'Броней не найдено.'}
          </p>
          <Link
            href="/excursions"
            className="bg-ink text-bg hover:bg-ink-soft mt-8 inline-block cursor-pointer px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
          >
            К экскурсиям
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {bookings.data?.items.map((booking) => (
            <li key={booking.id} className="bg-white p-6 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${statusStyles[booking.status]}`}
                  >
                    {BOOKING_STATUS_LABELS[booking.status]}
                  </span>
                  <h3 className="text-ink mt-3 text-lg font-medium">
                    {booking.tour ? (
                      <Link href={`/excursions/${booking.tour.slug}`} className="hover:text-ink">
                        {booking.tour.title}
                      </Link>
                    ) : (
                      'Экскурсия недоступна'
                    )}
                  </h3>
                  <div className="text-muted mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4" />
                      {booking.startsAt ? formatDateTime(booking.startsAt) : 'дата согласовывается'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <UsersIcon className="h-4 w-4" /> {booking.peopleCount} чел.
                    </span>
                  </div>
                  {booking.cancelReason ? (
                    <p className="text-faint mt-2 text-xs">Причина отмены: {booking.cancelReason}</p>
                  ) : null}
                </div>
                <p className="text-ink font-display text-xl font-medium">
                  {formatPrice(booking.totalPrice)}
                </p>
              </div>

              <div className="border-line mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
                {canCancel(booking) ? (
                  cancelId === booking.id ? (
                    <div className="w-full space-y-3">
                      <label htmlFor={`reason-${booking.id}`} className="field-label">
                        Почему отменяете? (необязательно)
                      </label>
                      <textarea
                        id={`reason-${booking.id}`}
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="field"
                        placeholder="Изменились планы…"
                      />
                      {error ? <p className="text-danger text-xs font-medium">{error}</p> : null}
                      <div className="flex gap-3">
                        <button
                          onClick={() => cancel.mutate({ id: booking.id, why: reason })}
                          disabled={cancel.isPending}
                          className="bg-ink text-bg hover:bg-ink-soft cursor-pointer px-7 py-3.5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 disabled:opacity-40"
                        >
                          {cancel.isPending ? 'Отменяем…' : 'Подтвердить отмену'}
                        </button>
                        <button
                          onClick={() => {
                            setCancelId(null);
                            setError(null);
                          }}
                          className="text-muted px-4 py-2.5 text-sm font-medium"
                        >
                          Передумал
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelId(booking.id)}
                      className="border-line text-ink hover:border-ink hover:bg-ink hover:text-bg cursor-pointer border px-6 py-3 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
                    >
                      Отменить
                    </button>
                  )
                ) : null}
                {booking.tour && (booking.status === 'cancelled' || booking.status === 'completed') ? (
                  <Link
                    href={`/excursions/${booking.tour.slug}#booking`}
                    className="bg-ink text-bg hover:bg-ink-soft cursor-pointer px-6 py-3 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
                  >
                    Забронировать снова
                  </Link>
                ) : null}
                <span className="text-faint ml-auto text-xs">
                  Заявка от {formatDateTime(booking.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
