'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Выбор даты и времени в оформлении сайта.
 *
 * Нативное поле типа datetime-local стилизовать нельзя: браузер рисует свой
 * календарь синим и своим шрифтом, и в монохромной вёрстке он выглядит
 * вставкой из другой программы. Значение хранится в том же формате
 * «ГГГГ-ММ-ДДTчч:мм», что и у нативного поля, — форма вокруг не менялась.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Время начала экскурсий: с девяти утра до восьми вечера, шаг полчаса. */
const TIMES = Array.from({ length: 23 }, (_, i) => {
  const minutes = 9 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/** Закрытое время: пустые часы означают весь день. */
export interface BlockedTime {
  date: string;
  startTime: string | null;
  endTime: string | null;
}

interface Interval {
  from: number;
  to: number;
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Закрытые промежутки по дням, в минутах от полуночи. */
function groupBlocked(blocked: BlockedTime[]): Map<string, Interval[]> {
  const byDate = new Map<string, Interval[]>();
  for (const block of blocked) {
    const interval = block.startTime
      ? { from: minutesOf(block.startTime), to: minutesOf(block.endTime ?? '24:00') }
      : { from: 0, to: 1440 };
    byDate.set(block.date, [...(byDate.get(block.date) ?? []), interval]);
  }
  return byDate;
}

const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Русская локаль дописывает «2026 г.» — в интерфейсе это лишний канцелярит. */
function human(formatter: Intl.DateTimeFormat, value: Date): string {
  return formatter.format(value).replace(/\s*г\.$/, '');
}

/** «2026-08-30T14:00» → части. Ничего не парсим через Date: часовые пояса тут только мешают. */
function split(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Сетка месяца с понедельника; в начале и конце — дни соседних месяцев. */
function monthGrid(year: number, month: number): { key: string; day: number; outside: boolean }[] {
  const first = new Date(year, month, 1);
  // getDay(): воскресенье — ноль, а неделя у нас начинается с понедельника.
  const shift = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - shift);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      key: toKey(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      outside: d.getMonth() !== month,
    };
  });
}

export function DateTimePicker({
  value,
  onChange,
  minDate,
  blocked,
  slotMinutes = 60,
  ariaLabel = 'Дата и время',
  placeholder = 'Выберите дату и время',
}: {
  value: string;
  onChange: (value: string) => void;
  /** Раньше этого дня выбирать нельзя, в формате «ГГГГ-ММ-ДД». */
  minDate?: string;
  /** Занятое время экскурсовода: такие дни и часы выбрать нельзя. */
  blocked?: BlockedTime[];
  /** Сколько длится экскурсия — чтобы час, наезжающий на занятый, тоже погас. */
  slotMinutes?: number;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const { date, time } = split(value);

  // Показываемый месяц: от выбранной даты, иначе от сегодняшней.
  const [view, setView] = useState(() => {
    const base = date ? new Date(`${date}T00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    if (!open || !date) return;
    const picked = new Date(`${date}T00:00`);
    setView({ year: picked.getFullYear(), month: picked.getMonth() });
  }, [open, date]);

  // «Сегодня» и нижнюю границу считаем только после открытия: на сервере
  // и в браузере это разные моменты, и разметка бы разошлась.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const now = new Date();
    setToday(toKey(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, close]);

  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const limit = minDate ?? today ?? '';

  const busy = useMemo(() => groupBlocked(blocked ?? []), [blocked]);

  /** Занят ли конкретный час: экскурсия целиком должна поместиться в свободное. */
  const timeTaken = useCallback(
    (day: string, time: string) => {
      const intervals = busy.get(day);
      if (!intervals) return false;
      const from = minutesOf(time);
      const to = from + slotMinutes;
      return intervals.some((i) => from < i.to && i.from < to);
    },
    [busy, slotMinutes],
  );

  /** День закрыт, если не остаётся ни одного времени начала. */
  const dayTaken = useCallback(
    (day: string) => busy.has(day) && TIMES.every((time) => timeTaken(day, time)),
    [busy, timeTaken],
  );

  const pickDay = (key: string) => {
    // Время сохраняем, если уже выбрано, иначе ставим первое разумное —
    // но не занятое: подставить заведомо закрытый час значит соврать.
    const keep = time && !timeTaken(key, time) ? time : null;
    const fallback = timeTaken(key, '10:00') ? TIMES.find((t) => !timeTaken(key, t)) : '10:00';
    onChange(`${key}T${keep ?? fallback ?? '10:00'}`);
    // Клик по дню соседнего месяца перелистывает календарь туда же:
    // иначе выбранная дата остаётся за краем сетки и её не видно.
    const picked = new Date(`${key}T00:00`);
    if (picked.getMonth() !== view.month || picked.getFullYear() !== view.year) {
      setView({ year: picked.getFullYear(), month: picked.getMonth() });
    }
  };

  const pickTime = (next: string) => {
    onChange(`${date || today || ''}T${next}`);
    close();
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const label = date
    ? `${human(fullDate, new Date(`${date}T00:00`))}${time ? `, ${time}` : ''}`
    : placeholder;

  const arrow =
    'flex h-9 w-9 cursor-pointer items-center justify-center border border-line text-ink ' +
    'transition-colors duration-500 hover:border-ink disabled:opacity-30';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`field flex cursor-pointer items-center justify-between text-left ${
          date ? 'text-ink' : 'text-faint'
        }`}
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="text-muted ml-3 h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <rect x="3" y="4.5" width="14" height="13" />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
        </svg>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="border-ink bg-bg shadow-float absolute left-0 z-40 mt-2 w-[19.5rem] border p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-ink text-sm first-letter:uppercase">
              {human(monthTitle, new Date(view.year, view.month, 1))}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц" className={arrow}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14.5 6 8.5 12l6 6" />
                </svg>
              </button>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц" className={arrow}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m9.5 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px" role="grid" aria-labelledby={id}>
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-faint pb-2 text-center text-[0.625rem] tracking-[0.1em] uppercase">
                {w}
              </span>
            ))}
            {grid.map((cell) => {
              const closed = dayTaken(cell.key);
              const disabled = (Boolean(limit) && cell.key < limit) || closed;
              const selected = cell.key === date;
              const isToday = cell.key === today;
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(cell.key)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={selected}
                  title={closed ? 'В этот день записи нет' : undefined}
                  className={`flex h-9 items-center justify-center text-xs tabular-nums transition-colors duration-300 ${
                    selected
                      ? 'bg-ink text-bg'
                      : disabled
                        ? 'text-line-strong cursor-not-allowed'
                        : cell.outside
                          ? 'text-faint hover:bg-surface-soft cursor-pointer'
                          : 'text-ink hover:bg-surface-soft cursor-pointer'
                  } ${isToday && !selected ? 'ring-line-strong ring-1' : ''}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <p className="kicker-plain text-faint mt-5 mb-3">Время</p>
          <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
            {TIMES.map((t) => {
              const taken = Boolean(date) && timeTaken(date, t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={taken}
                  onClick={() => pickTime(t)}
                  aria-pressed={t === time}
                  title={taken ? 'Это время занято' : undefined}
                  className={`py-2 text-xs tabular-nums transition-colors duration-300 ${
                    t === time
                      ? 'bg-ink text-bg'
                      : taken
                        ? 'text-line-strong cursor-not-allowed line-through'
                        : 'text-muted hover:bg-surface-soft cursor-pointer'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {date ? (
            <button
              type="button"
              onClick={() => {
                onChange('');
                close();
              }}
              className="link-underline text-muted hover:text-ink mt-4 cursor-pointer text-[0.6875rem] font-medium tracking-[0.14em] uppercase"
            >
              Очистить
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
