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
        <p className="text-muted text-sm">
          {unread > 0 ? `Непрочитанных: ${unread}` : 'Все уведомления прочитаны'}
        </p>
        {unread > 0 ? (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="link-underline text-muted hover:text-ink cursor-pointer text-sm disabled:opacity-40"
          >
            Отметить все прочитанными
          </button>
        ) : null}
      </div>

      {notifications.isLoading ? (
        <p className="text-muted animate-pulse py-10 text-center">Загружаем уведомления…</p>
      ) : items.length === 0 ? (
        <div className="border-line border-t py-16 text-center">
          <p className="text-ink text-lg font-medium">Уведомлений пока нет</p>
          <p className="text-muted mt-2 text-sm">
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
                className={`border-line flex items-start gap-5 border-b py-6 ${
                  isUnread ? 'text-ink' : 'text-muted'
                }`}
              >
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    isUnread ? 'bg-ink' : 'bg-line-strong'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium">
                    {typeLabels[notification.type] ?? notification.type}
                  </p>
                  {tourTitle ? <p className="text-muted mt-0.5 text-sm">{tourTitle}</p> : null}
                  <p className="text-faint mt-1 text-xs">{formatDateTime(notification.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
