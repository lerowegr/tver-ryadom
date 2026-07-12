'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { NotificationDto } from '@/lib/types';

interface NotificationsResponse {
  items: NotificationDto[];
  total: number;
  unread: number;
}

const typeLabels: Record<string, string> = {
  booking_created: 'Заявка на бронирование отправлена',
  booking_confirmed: 'Бронирование подтверждено',
  booking_cancelled: 'Бронирование отменено',
  booking_reminder: 'Напоминание об экскурсии',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => authFetch<NotificationsResponse>('/notifications?limit=50'),
  });

  const markAll = useMutation({
    mutationFn: () => authFetch('/notifications/read', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-bark-700 text-sm">
          {unread > 0 ? `Непрочитанных: ${unread}` : 'Все уведомления прочитаны'}
        </p>
        {unread > 0 ? (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="text-terra-600 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-60"
          >
            Отметить все прочитанными
          </button>
        ) : null}
      </div>

      {notifications.isLoading ? (
        <p className="text-bark-600 animate-pulse py-10 text-center">Загружаем уведомления…</p>
      ) : items.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <p className="text-ink-900 text-lg font-semibold">Уведомлений пока нет</p>
          <p className="text-bark-700 mt-2 text-sm">
            Здесь появятся подтверждения броней и напоминания об экскурсиях.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((notification) => {
            const isUnread = notification.readAt === null;
            const tourTitle =
              typeof notification.payload?.tourTitle === 'string' ? notification.payload.tourTitle : null;
            return (
              <li
                key={notification.id}
                className={`shadow-card flex items-start gap-4 rounded-3xl p-5 ${
                  isUnread ? 'border-terra-500/40 border bg-white' : 'bg-white/60'
                }`}
              >
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    isUnread ? 'bg-terra-500' : 'bg-sand-300'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-ink-900 text-sm font-semibold">
                    {typeLabels[notification.type] ?? notification.type}
                  </p>
                  {tourTitle ? <p className="text-bark-700 mt-0.5 text-sm">{tourTitle}</p> : null}
                  <p className="text-bark-500 mt-1 text-xs">{formatDateTime(notification.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
