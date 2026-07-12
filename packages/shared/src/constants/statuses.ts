export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TOUR_STATUSES = ['draft', 'published', 'archived'] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export const TOUR_STATUS_LABELS: Record<TourStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  archived: 'В архиве',
};

export const PRICE_TYPES = ['per_person', 'per_group'] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  per_person: 'за человека',
  per_group: 'за группу',
};

export const SCHEDULE_STATUSES = ['open', 'closed', 'cancelled'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждено',
  cancelled: 'Отменено',
  completed: 'Завершено',
};

export const PAYMENT_STATUSES = ['none', 'pending', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  none: 'Без онлайн-оплаты',
  pending: 'Ожидает оплаты',
  paid: 'Оплачено',
  refunded: 'Возврат',
};

export const BOOKING_SOURCES = ['web', 'telegram', 'admin'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['telegram', 'email', 'sms', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const OUTBOX_STATUSES = ['pending', 'sent', 'failed'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const CONTACT_REQUEST_STATUSES = ['new', 'processed'] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];
