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
    <section className={`shadow-card rounded-2xl bg-white p-6 ${className}`}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-ink-900 font-bold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const bookingStatusStyles: Record<BookingStatus, string> = {
  pending: 'bg-sand-200 text-bark-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-cream-200 text-bark-600',
  completed: 'bg-bark-600/10 text-bark-800',
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${bookingStatusStyles[status]}`}>
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}

const tourStatusStyles: Record<TourStatus, string> = {
  draft: 'bg-sand-200 text-bark-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-cream-200 text-bark-600',
};

export function TourStatusPill({ status }: { status: TourStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${tourStatusStyles[status]}`}>
      {TOUR_STATUS_LABELS[status]}
    </span>
  );
}

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: 'На модерации',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

const reviewStatusStyles: Record<ReviewStatus, string> = {
  pending: 'bg-sand-200 text-bark-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-cream-200 text-bark-600',
};

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${reviewStatusStyles[status]}`}>
      {reviewStatusLabels[status]}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-cream-200 border-b">
            {head.map((h) => (
              <th key={h} className="text-bark-600 py-2.5 pr-4 text-xs font-semibold tracking-wide uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-cream-200 divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="text-bark-600 py-8 text-center text-sm">{text}</p>;
}

export function Loading() {
  return <p className="text-bark-600 animate-pulse py-8 text-center text-sm">Загружаем…</p>;
}
