import type { ReactNode } from 'react';
import {
  BOOKING_STATUS_LABELS,
  TOUR_STATUS_LABELS,
  type BookingStatus,
  type ReviewStatus,
  type TourStatus,
} from '@tver/shared';

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-6 ${className}`}>
      {title || action ? (
        <div className="border-line mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          {title ? <h2 className="kicker-plain">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Статусы. Палитра монохромная, но в рабочем инструменте статус нужно
 * ловить взглядом, поэтому «рабочее» состояние подсвечено зелёным,
 * а завершённое/отклонённое — приглушено. Это служебные цвета, не акцент.
 */
const pill = 'inline-block border px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.14em] uppercase whitespace-nowrap';
const neutral = 'border-line-strong text-ink';
const positive = 'border-success/40 text-success';
const faded = 'border-line text-faint';

const bookingStatusStyles: Record<BookingStatus, string> = {
  pending: neutral,
  confirmed: positive,
  cancelled: faded,
  completed: faded,
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <span className={`${pill} ${bookingStatusStyles[status]}`}>{BOOKING_STATUS_LABELS[status]}</span>;
}

const tourStatusStyles: Record<TourStatus, string> = {
  draft: neutral,
  published: positive,
  archived: faded,
};

export function TourStatusPill({ status }: { status: TourStatus }) {
  return <span className={`${pill} ${tourStatusStyles[status]}`}>{TOUR_STATUS_LABELS[status]}</span>;
}

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: 'На модерации',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

const reviewStatusStyles: Record<ReviewStatus, string> = {
  pending: neutral,
  approved: positive,
  rejected: faded,
};

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  return <span className={`${pill} ${reviewStatusStyles[status]}`}>{reviewStatusLabels[status]}</span>;
}

/**
 * Переключатель разделов. Заменяет и «пилюли» со скруглением, и нативный
 * <select>: список вариантов у него рисует операционная система, оформить
 * его нельзя, и он выбивался из остального интерфейса.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="border-line inline-flex flex-wrap border" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer px-5 py-3 text-[0.625rem] font-medium tracking-[0.16em] uppercase transition-colors duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              active ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-line border-b">
            {head.map((h) => (
              <th key={h} className="kicker-plain py-3 pr-4 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="text-muted py-10 text-center text-sm">{text}</p>;
}

/** Ошибка загрузки данных — показываем явно, а не как пустой список. */
export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Не удалось загрузить данные — проверьте соединение';
  return (
    <div className="border-danger border-l-2 py-3 pl-4" role="alert">
      <p className="text-danger text-sm">{message}</p>
      {retry ? (
        <button onClick={retry} className="btn-secondary mt-3 !px-4 !py-2">
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function Loading() {
  return <p className="kicker-plain text-muted animate-pulse py-10 text-center">Загружаем…</p>;
}
