'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { authFetch } from '@/lib/api';
import { Card, Loading } from '@/components/ui';

/**
 * Календарь занятости: что и когда идёт, сколько мест занято, кто записан.
 *
 * Слоты расписания и заявки на свою дату — разные вещи, поэтому и помечены
 * по-разному: слот залит, заявка обведена. Так на сетке месяца сразу видно,
 * где уже назначено время, а где человек только просит дату.
 */

interface Guest {
  name: string;
  phone: string;
  people: number;
  status: string;
}

interface Entry {
  id: string;
  kind: 'slot' | 'request';
  tourId: string;
  tourTitle: string;
  startsAt: string;
  durationMinutes: number;
  capacity?: number;
  booked?: number;
  people?: number;
  status: string;
  contactName?: string;
  contactPhone?: string;
  guests?: Guest[];
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

const STATUS_RU: Record<string, string> = {
  pending: 'ждёт подтверждения',
  confirmed: 'подтверждена',
  completed: 'завершена',
  open: 'открыт',
  closed: 'закрыт',
  cancelled: 'отменён',
};

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Русская локаль дописывает «2026 г.» — в заголовке это лишнее. */
function human(formatter: Intl.DateTimeFormat, value: Date): string {
  return formatter.format(value).replace(/\s*г\.$/, '');
}

export default function CalendarPage() {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [picked, setPicked] = useState<string | null>(null);

  // Берём месяц с запасом в неделю по краям: в сетке видны дни соседних месяцев.
  const from = key(new Date(view.year, view.month, -7));
  const to = key(new Date(view.year, view.month + 1, 7));

  const calendar = useQuery({
    queryKey: ['admin-calendar', from, to],
    queryFn: () => authFetch<{ entries: Entry[] }>(`/admin/calendar?from=${from}&to=${to}`),
  });

  const feed = useQuery({
    queryKey: ['admin-calendar-feed'],
    queryFn: () => authFetch<{ token: string; url: string }>('/admin/calendar/feed'),
  });

  const queryClient = useQueryClient();
  const rotate = useMutation({
    mutationFn: () => authFetch('/admin/calendar/feed/rotate', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-calendar-feed'] }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of calendar.data?.entries ?? []) {
      const d = new Date(entry.startsAt);
      const k = key(d);
      map.set(k, [...(map.get(k) ?? []), entry]);
    }
    return map;
  }, [calendar.data]);

  const grid = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const shift = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(view.year, view.month, 1 - shift + i);
      return { date: d, k: key(d), outside: d.getMonth() !== view.month };
    });
  }, [view]);

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const today = key(new Date());
  const chosen = picked ? (byDay.get(picked) ?? []) : [];

  const arrow =
    'flex h-9 w-9 cursor-pointer items-center justify-center border border-line text-ink ' +
    'transition-colors duration-300 hover:border-ink';

  return (
    <div className="space-y-6">
      <Card
        title="Календарь занятости"
        action={
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => shift(-1)} aria-label="Предыдущий месяц" className={arrow}>
              ‹
            </button>
            <span className="text-ink min-w-[9rem] text-center text-sm first-letter:uppercase">
              {human(monthTitle, new Date(view.year, view.month, 1))}
            </span>
            <button type="button" onClick={() => shift(1)} aria-label="Следующий месяц" className={arrow}>
              ›
            </button>
          </div>
        }
      >
        {calendar.isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-faint pb-2 text-center text-[0.625rem] tracking-[0.1em] uppercase">
                  {w}
                </span>
              ))}
              {grid.map((cell) => {
                const entries = byDay.get(cell.k) ?? [];
                const slots = entries.filter((e) => e.kind === 'slot').length;
                const requests = entries.length - slots;
                const active = picked === cell.k;
                return (
                  <button
                    key={cell.k}
                    type="button"
                    onClick={() => setPicked(active ? null : cell.k)}
                    aria-current={cell.k === today ? 'date' : undefined}
                    aria-pressed={active}
                    className={`flex min-h-[4.5rem] cursor-pointer flex-col items-start gap-1 p-2 text-left transition-colors duration-300 ${
                      active ? 'bg-ink text-bg' : 'hover:bg-surface-soft'
                    } ${cell.k === today && !active ? 'ring-line-strong ring-1' : ''}`}
                  >
                    <span
                      className={`text-xs tabular-nums ${
                        active ? 'text-bg' : cell.outside ? 'text-faint' : 'text-ink'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {/* Слот залит, заявка обведена — форма несёт смысл наравне с цветом. */}
                      {Array.from({ length: slots }).map((_, i) => (
                        <span
                          key={`s${i}`}
                          title="Слот расписания"
                          className={`h-1.5 w-4 ${active ? 'bg-bg' : 'bg-ink'}`}
                        />
                      ))}
                      {Array.from({ length: requests }).map((_, i) => (
                        <span
                          key={`r${i}`}
                          title="Заявка на свою дату"
                          className={`h-1.5 w-4 border ${active ? 'border-bg' : 'border-ink'}`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-muted mt-4 flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-2">
                <span className="bg-ink h-1.5 w-4" /> слот расписания
              </span>
              <span className="flex items-center gap-2">
                <span className="border-ink h-1.5 w-4 border" /> заявка на свою дату
              </span>
            </p>
          </>
        )}
      </Card>

      {picked ? (
        <Card title={human(dayTitle, new Date(`${picked}T00:00`))}>
          {chosen.length === 0 ? (
            <p className="text-muted text-sm">В этот день ничего не назначено.</p>
          ) : (
            <div className="space-y-3">
              {chosen.map((entry) => (
                <div key={entry.id} className="bg-surface-soft p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="text-ink text-sm">
                      <span className="tabular-nums">{clock.format(new Date(entry.startsAt))}</span>{' '}
                      — {entry.tourTitle}
                    </p>
                    <p className="text-muted text-xs">
                      {entry.kind === 'slot'
                        ? `${entry.booked}/${entry.capacity} мест · слот ${STATUS_RU[entry.status] ?? entry.status}`
                        : `заявка на свою дату · ${STATUS_RU[entry.status] ?? entry.status}`}
                    </p>
                  </div>

                  {entry.kind === 'slot' ? (
                    entry.guests && entry.guests.length > 0 ? (
                      <ul className="mt-3 space-y-1">
                        {entry.guests.map((g, i) => (
                          <li key={i} className="text-muted text-xs">
                            {g.name}, {g.people} чел. — {g.phone} ({STATUS_RU[g.status] ?? g.status})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-faint mt-3 text-xs">Записей пока нет.</p>
                    )
                  ) : (
                    <p className="text-muted mt-3 text-xs">
                      {entry.contactName}, {entry.people} чел. — {entry.contactPhone}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Card title="Подписка во внешнем календаре">
        <p className="text-muted text-sm leading-relaxed">
          Ссылка ниже отдаёт занятость в формате iCalendar. Её понимают Google Календарь, Apple
          Календарь, Outlook и Яндекс Календарь: они сами перечитывают ленту раз в час, и всё, что
          вы меняете здесь, появляется там без ручного переноса.
        </p>

        {feed.data ? (
          <div className="mt-4 space-y-3">
            <div className="bg-surface-soft flex flex-wrap items-center gap-3 p-3">
              <code className="text-ink min-w-0 flex-1 truncate text-xs">{feed.data.url}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(feed.data.url)}
                className="btn-secondary"
              >
                Скопировать
              </button>
            </div>
            <p className="text-faint text-xs leading-relaxed">
              Ссылка — это и есть пароль: у кого она есть, тот видит расписание и контакты гостей.
              Не публикуйте её. Если ссылка утекла — смените, старая перестанет работать сразу.
            </p>
            <button
              type="button"
              onClick={() => rotate.mutate()}
              disabled={rotate.isPending}
              className="btn-danger"
            >
              {rotate.isPending ? 'Меняем…' : 'Сменить ссылку'}
            </button>
          </div>
        ) : (
          <Loading />
        )}

        <div className="border-line mt-6 border-t pt-5">
          <p className="text-ink text-sm">Как подключить</p>
          <ol className="text-muted mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
            <li>Google Календарь: слева «Другие календари» → «Подписаться по URL» → вставить ссылку.</li>
            <li>Apple Календарь: «Файл» → «Новая подписка на календарь» → вставить ссылку.</li>
            <li>Outlook: «Добавить календарь» → «Подписаться из интернета».</li>
            <li>
              Todoist подписки на такие ленты не умеет — но у него есть двусторонняя связь с Google
              Календарём, так что достаточно подключить ленту к Google.
            </li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
