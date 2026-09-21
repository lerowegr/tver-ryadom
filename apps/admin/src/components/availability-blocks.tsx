'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { Card } from '@/components/ui';

/**
 * Закрытие дней и часов.
 *
 * Отпуск, отъезд, экскурсия, проданная на Спутнике или Авито, — всё это
 * закрывается здесь, и форма бронирования такие дни просто не предлагает.
 * Период закрывается разом, а открывается по одному дню: планы меняются
 * чаще в одну сторону, чем в другую.
 */

export interface AvailabilityBlock {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

const dayTitle = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

function human(date: string): string {
  return dayTitle.format(new Date(`${date}T00:00`));
}

export function AvailabilityBlocks({
  blocks,
  from,
  to,
  defaultDate,
}: {
  blocks: AvailabilityBlock[];
  from: string;
  to: string;
  /** День, выбранный на сетке, — подставляем в форму как начало периода. */
  defaultDate?: string | null;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [wholeDay, setWholeDay] = useState(true);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-availability'] });
  const fail = (message: string) => (err: unknown) =>
    setError(err instanceof ApiRequestError ? err.message : message);

  const close = useMutation({
    mutationFn: (input: Record<string, string | undefined>) =>
      authFetch('/admin/availability', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: fail('Не удалось закрыть период'),
  });

  const openDay = useMutation({
    mutationFn: (date: string) => authFetch(`/admin/availability/day/${date}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: fail('Не удалось открыть день'),
  });

  const openOne = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/availability/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: fail('Не удалось снять закрытие'),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get('from') ?? '');
    if (!start) return;

    close.mutate({
      from: start,
      // Пустой «по» означает один день: закрыть завтрашний вечер — обычное
      // дело, и заставлять ради этого дважды вводить дату незачем.
      to: String(form.get('to') ?? '') || start,
      startTime: wholeDay ? undefined : String(form.get('startTime') ?? '') || undefined,
      endTime: wholeDay ? undefined : String(form.get('endTime') ?? '') || undefined,
      note: String(form.get('note') ?? '').trim() || undefined,
    });
    event.currentTarget.reset();
  };

  /** Показываем только то, что попало в загруженный период сетки. */
  const visible = blocks.filter((block) => block.date >= from && block.date <= to);
  const byDate = new Map<string, AvailabilityBlock[]>();
  for (const block of visible) byDate.set(block.date, [...(byDate.get(block.date) ?? []), block]);
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card title="Закрытые дни и часы">
      <p className="text-muted mb-5 text-sm leading-relaxed">
        Закрытое время не показывается в форме бронирования: на такие дни и часы записаться
        нельзя. Слоты расписания это не трогает — их вы ставите сами.
      </p>

      <form onSubmit={onSubmit} className="mb-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="block-from" className="text-muted mb-1.5 block text-xs font-medium">
              С какого дня
            </label>
            <input
              id="block-from"
              name="from"
              type="date"
              required
              key={defaultDate ?? 'empty'}
              defaultValue={defaultDate ?? undefined}
              className="input w-auto"
            />
          </div>
          <div>
            <label htmlFor="block-to" className="text-muted mb-1.5 block text-xs font-medium">
              По какой (можно оставить пустым)
            </label>
            <input id="block-to" name="to" type="date" className="input w-auto" />
          </div>
        </div>

        <label className="text-ink flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wholeDay}
            onChange={(event) => setWholeDay(event.target.checked)}
            className="accent-ink h-4 w-4 cursor-pointer"
          />
          Закрыть целиком, на весь день
        </label>

        {wholeDay ? null : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="block-start" className="text-muted mb-1.5 block text-xs font-medium">
                С какого часа
              </label>
              <input
                id="block-start"
                name="startTime"
                type="time"
                required
                defaultValue="12:00"
                className="input w-auto"
              />
            </div>
            <div>
              <label htmlFor="block-end" className="text-muted mb-1.5 block text-xs font-medium">
                По какой
              </label>
              <input
                id="block-end"
                name="endTime"
                type="time"
                required
                defaultValue="16:00"
                className="input w-auto"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="block-note" className="text-muted mb-1.5 block text-xs font-medium">
              Заметка для себя (гости её не видят)
            </label>
            <input
              id="block-note"
              name="note"
              maxLength={200}
              placeholder="Отпуск, экскурсия со Спутника…"
              className="input"
            />
          </div>
          <button type="submit" disabled={close.isPending} className="btn-primary">
            {close.isPending ? 'Закрываем…' : 'Закрыть'}
          </button>
        </div>
      </form>

      {error ? (
        <p className="text-danger mb-4 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}

      {days.length === 0 ? (
        <p className="text-muted text-sm">В этом периоде закрытых дней нет.</p>
      ) : (
        <ul className="border-line border-t">
          {days.map(([date, items]) => (
            <li key={date} className="border-line flex flex-wrap items-center gap-3 border-b py-3">
              <span className="text-ink min-w-[8rem] text-sm">{human(date)}</span>
              <span className="text-muted flex-1 text-sm">
                {items
                  .map((block) =>
                    block.startTime
                      ? `${block.startTime}–${block.endTime}${block.note ? ` (${block.note})` : ''}`
                      : `весь день${block.note ? ` (${block.note})` : ''}`,
                  )
                  .join(', ')}
              </span>
              {items.length === 1 && items[0] ? (
                <button
                  type="button"
                  onClick={() => openOne.mutate(items[0]!.id)}
                  className="btn-secondary"
                >
                  Открыть
                </button>
              ) : (
                <button type="button" onClick={() => openDay.mutate(date)} className="btn-secondary">
                  Открыть день
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
