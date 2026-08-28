'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/api';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { AdminStats } from '@/lib/types';
import { BookingStatusPill, Card, Empty, Loading, Table } from '@/components/ui';

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => authFetch<AdminStats>('/admin/stats') });
  const data = stats.data;

  const cards = [
    { label: 'Заявок сегодня', value: data?.bookingsToday ?? '—' },
    { label: 'Ждут подтверждения', value: data?.pendingBookings ?? '—', href: '/bookings' },
    { label: 'Предстоящие брони', value: data?.upcomingBookings ?? '—' },
    { label: 'Выручка (подтв.)', value: data ? formatPrice(data.revenue) : '—' },
    { label: 'Отзывы на модерации', value: data?.pendingReviews ?? '—', href: '/reviews' },
    { label: 'Новые заявки с форм', value: data?.newRequests ?? '—', href: '/requests' },
  ];

  const maxDay = Math.max(1, ...(data?.bookingsByDay.map((d) => d.total) ?? [1]));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-ink text-[1.75rem] leading-tight">Дашборд</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const inner = (
            <>
              <p className="text-muted text-xs font-medium tracking-wide uppercase">{card.label}</p>
              <p className="text-ink mt-2 text-3xl font-medium">{card.value}</p>
            </>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} className="hover:shadow-lg block bg-white p-5 transition">
              {inner}
            </Link>
          ) : (
            <div key={card.label} className="bg-white p-5">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card title="Последние заявки">
          {stats.isLoading ? (
            <Loading />
          ) : (data?.recentBookings.length ?? 0) === 0 ? (
            <Empty text="Заявок пока нет" />
          ) : (
            <Table head={['Клиент', 'Экскурсия', 'Дата', 'Чел.', 'Сумма', 'Статус']}>
              {data?.recentBookings.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 pr-4 font-medium">{b.contactName}</td>
                  <td className="text-muted py-3 pr-4">{b.tour?.title ?? '—'}</td>
                  <td className="text-muted py-3 pr-4 whitespace-nowrap">{formatDateTime(b.startsAt)}</td>
                  <td className="text-muted py-3 pr-4">{b.peopleCount}</td>
                  <td className="py-3 pr-4 font-medium whitespace-nowrap">{formatPrice(b.totalPrice)}</td>
                  <td className="py-3">
                    <BookingStatusPill status={b.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Брони за 7 дней">
          {data ? (
            <div className="flex h-40 items-end gap-2">
              {data.bookingsByDay.length === 0 ? (
                <Empty text="Нет данных" />
              ) : (
                data.bookingsByDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-muted text-xs font-medium">{d.total}</span>
                    <div
                      className="bg-ink/80 w-full rounded-t-md"
                      style={{ height: `${Math.max(8, (d.total / maxDay) * 100)}%` }}
                    />
                    <span className="text-faint text-[10px]">{d.day.slice(5)}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <Loading />
          )}
        </Card>
      </div>
    </div>
  );
}
