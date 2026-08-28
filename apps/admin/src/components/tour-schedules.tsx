'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminSchedule } from '@/lib/types';
import { Card, Empty } from '@/components/ui';

export function TourSchedules({ tourId, schedules }: { tourId: string; schedules: AdminSchedule[] }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-tour', tourId] });

  const create = useMutation({
    mutationFn: (input: { startsAt: string; capacity: number }) =>
      authFetch('/admin/schedules', {
        method: 'POST',
        body: JSON.stringify({ tourId, startsAt: new Date(input.startsAt).toISOString(), capacity: input.capacity }),
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : 'Не удалось создать слот'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : 'Не удалось удалить слот'),
  });

  const onAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get('startsAt') ?? '');
    const capacity = Number(form.get('capacity') ?? 0);
    if (!startsAt || capacity < 1) return;
    create.mutate({ startsAt, capacity });
    event.currentTarget.reset();
  };

  const upcoming = schedules.filter((s) => new Date(s.startsAt).getTime() > Date.now());
  const past = schedules.filter((s) => new Date(s.startsAt).getTime() <= Date.now());

  return (
    <Card title="Расписание">
      <form onSubmit={onAdd} className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="sched-date" className="text-muted mb-1.5 block text-xs font-medium">
            Дата и время
          </label>
          <input
            id="sched-date"
            name="startsAt"
            type="datetime-local"
            required
            min={new Date(Date.now() + 3600_000).toISOString().slice(0, 16)}
            className="input w-auto"
          />
        </div>
        <div>
          <label htmlFor="sched-cap" className="text-muted mb-1.5 block text-xs font-medium">
            Мест
          </label>
          <input id="sched-cap" name="capacity" type="number" min={1} max={200} defaultValue={10} required className="input w-24" />
        </div>
        <button type="submit" disabled={create.isPending} className="btn-primary">
          Добавить слот
        </button>
      </form>

      {error ? (
        <p className="bg-transparent text-danger mb-4 px-4 py-3 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}

      {schedules.length === 0 ? (
        <Empty text="Слотов пока нет — гости смогут оставлять заявки на свободную дату" />
      ) : (
        <ul className="space-y-2">
          {[...upcoming, ...past].map((slot) => {
            const isPast = new Date(slot.startsAt).getTime() <= Date.now();
            return (
              <li
                key={slot.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 ${
                  isPast ? 'bg-surface-soft opacity-60' : 'bg-surface-soft'
                }`}
              >
                <span className="text-ink text-sm font-medium">{formatDateTime(slot.startsAt)}</span>
                <span className="text-muted text-xs">
                  занято {slot.bookedCount} из {slot.capacity}
                  {slot.status !== 'open' ? ` · ${slot.status === 'cancelled' ? 'отменён' : 'закрыт'}` : ''}
                </span>
                {!isPast && slot.status === 'open' ? (
                  <button
                    onClick={() => {
                      if (window.confirm('Удалить/закрыть слот?')) remove.mutate(slot.id);
                    }}
                    disabled={remove.isPending}
                    className="btn-danger !px-3 !py-1.5 text-xs"
                  >
                    Убрать
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
