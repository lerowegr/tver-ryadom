'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { authFetch } from '@/lib/api';
import { AvailabilityBlocks, type AvailabilityBlock } from '@/components/availability-blocks';
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
const clock = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

const STATUS_RU: Record<string, string> = {
  pending: 'ждёт подтверждения',
  confirmed: 'подтверждена',
  completed: 'завершена',
  open: 'открыт',
  closed: 'закрыт',
  cancelled: 'отменён',
};

type Preset = 'today' | 'week' | 'month' | 'custom' | null;

/** Готовые периоды. «Свой промежуток» набирается двумя кликами по сетке. */
const PRESETS: { value: Exclude<Preset, null>; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'custom', label: 'Свой промежуток' },
];
interface Range {
  from: string;
  to: string;
}

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
  const [range, setRange] = useState<Range | null>(null);
  const [preset, setPreset] = useState<Preset>(null);
  /** Первый клик своего промежутка: ждём второй, чтобы понять границы. */
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  // Сетка месяца показывает дни соседних, поэтому берём запас по краям.
  // Если выбран период — грузим и его: он может уходить за пределы месяца.
  const monthFrom = key(new Date(view.year, view.month, -7));
  const monthTo = key(new Date(view.year, view.month + 1, 7));
  const from = range && range.from < monthFrom ? range.from : monthFrom;
  const to = range && range.to > monthTo ? range.to : monthTo;

  const calendar = useQuery({
    queryKey: ['admin-calendar', from, to],
    queryFn: () => authFetch<{ entries: Entry[] }>(`/admin/calendar?from=${from}&to=${to}`),
  });

  const availability = useQuery({
    queryKey: ['admin-availability', from, to],
    queryFn: () => authFetch<{ blocks: AvailabilityBlock[] }>(`/admin/availability?from=${from}&to=${to}`),
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

  /** Пресеты периода. Неделя — календарная, с понедельника. */
  const applyPreset = (next: Preset) => {
    setPicked(null);
    setPendingFrom(null);
    setPreset(next);

    const now = new Date();
    if (next === 'today') {
      setRange({ from: key(now), to: key(now) });
    } else if (next === 'week') {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setRange({ from: key(monday), to: key(sunday) });
      setView({ year: monday.getFullYear(), month: monday.getMonth() });
    } else if (next === 'month') {
      const first = new Date(view.year, view.month, 1);
      const last = new Date(view.year, view.month + 1, 0);
      setRange({ from: key(first), to: key(last) });
    } else {
      // «Свой промежуток» и «Очистить» период сами не задают.
      setRange(null);
    }
  };

  /** Клик по дню: в режиме своего промежутка набирает границы, иначе — один день. */
  const onDayClick = (k: string) => {
    if (preset !== 'custom') {
      setRange(null);
      setPicked(picked === k ? null : k);
      return;
    }
    if (!pendingFrom) {
      setPendingFrom(k);
      setRange(null);
      return;
    }
    // Второй клик может оказаться раньше первого — тогда меняем местами.
    const [a, b] = pendingFrom <= k ? [pendingFrom, k] : [k, pendingFrom];
    setRange({ from: a, to: b });
    setPendingFrom(null);
  };

  /** Записи выбранного периода, сгруппированные по дням. */
  const inRange = useMemo(() => {
    if (!range) return null;
    const days: { day: string; items: Entry[] }[] = [];
    for (const [day, items] of byDay) {
      if (day >= range.from && day <= range.to) days.push({ day, items });
    }
    return days.sort((a, b) => a.day.localeCompare(b.day));
  }, [range, byDay]);

  /** Дни, целиком закрытые для записи: на сетке они перечёркнуты. */
  const closedDays = useMemo(() => {
    const set = new Set<string>();
    for (const block of availability.data?.blocks ?? []) {
      if (!block.startTime) set.add(block.date);
    }
    return set;
  }, [availability.data]);

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
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {PRESETS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => applyPreset(item.value)}
                  aria-pressed={preset === item.value}
                  className={`cursor-pointer border px-4 py-2 text-xs transition-colors duration-300 ${
                    preset === item.value
                      ? 'border-ink bg-ink text-bg'
                      : 'border-line text-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {preset || picked ? (
                <button
                  type="button"
                  onClick={() => {
                    setPreset(null);
                    setRange(null);
                    setPicked(null);
                    setPendingFrom(null);
                  }}
                  className="text-muted hover:text-ink cursor-pointer px-3 py-2 text-xs underline"
                >
                  Очистить
                </button>
              ) : null}
            </div>

            {preset === 'custom' ? (
              <p className="text-muted mb-4 text-xs">
                {pendingFrom
                  ? `Начало — ${human(dayTitle, new Date(`${pendingFrom}T00:00`))}. Теперь выберите конец.`
                  : 'Нажмите день начала, затем день конца промежутка.'}
              </p>
            ) : null}

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
                const inSelected = Boolean(range && cell.k >= range.from && cell.k <= range.to);
                const active = picked === cell.k || cell.k === pendingFrom;
                const closed = closedDays.has(cell.k);
                return (
                  <button
                    key={cell.k}
                    type="button"
                    onClick={() => onDayClick(cell.k)}
                    aria-current={cell.k === today ? 'date' : undefined}
                    aria-pressed={active}
                    title={closed ? 'День закрыт для записи' : undefined}
                    className={`flex min-h-[4.5rem] cursor-pointer flex-col items-start gap-1 p-2 text-left transition-colors duration-300 ${
                      active ? 'bg-ink text-bg' : 'hover:bg-surface-soft'
                    } ${inSelected && !active ? 'bg-surface-soft' : ''} ${
                      cell.k === today && !active ? 'ring-line-strong ring-1' : ''
                    }`}
                  >
                    <span
                      className={`text-xs tabular-nums ${closed ? 'line-through' : ''} ${
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
              <span className="flex items-center gap-2">
                <span className="text-faint line-through">00</span> день закрыт для записи
              </span>
            </p>

            <p className="text-faint mt-3 text-xs leading-relaxed">
              Слоты — это сборные выходы: они заводятся на странице экскурсии, в блоке
              «Расписание», и сразу попадают в раздел «Расписание» на сайте.
            </p>
          </>
        )}
      </Card>

      {inRange ? (
        <Card
          title={
            range!.from === range!.to
              ? human(dayTitle, new Date(`${range!.from}T00:00`))
              : `${human(dayTitle, new Date(`${range!.from}T00:00`))} — ${human(dayTitle, new Date(`${range!.to}T00:00`))}`
          }
        >
          {inRange.length === 0 ? (
            <p className="text-muted text-sm">За выбранный период ничего не назначено.</p>
          ) : (
            <div className="space-y-6">
              <p className="text-muted text-sm">
                Событий: {inRange.reduce((sum, d) => sum + d.items.length, 0)} за{' '}
                {inRange.length} {inRange.length === 1 ? 'день' : 'дн.'}
              </p>
              {inRange.map(({ day, items }) => (
                <div key={day}>
                  <p className="text-ink mb-2 text-sm first-letter:uppercase">
                    {human(dayTitle, new Date(`${day}T00:00`))}
                  </p>
                  <div className="space-y-2">
                    {items.map((entry) => (
                      <div key={entry.id} className="bg-surface-soft flex flex-wrap justify-between gap-3 p-3">
                        <span className="text-ink text-sm">
                          <span className="tabular-nums">{clock.format(new Date(entry.startsAt))}</span> —{' '}
                          {entry.tourTitle}
                        </span>
                        <span className="text-muted text-xs">
                          {entry.kind === 'slot'
                            ? `${entry.booked}/${entry.capacity} мест`
                            : `заявка · ${entry.people} чел.`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

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

      <AvailabilityBlocks
        blocks={availability.data?.blocks ?? []}
        from={from}
        to={to}
        defaultDate={picked}
      />

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
