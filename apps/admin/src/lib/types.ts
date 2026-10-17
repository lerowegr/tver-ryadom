import type {
  BookingStatus,
  ContactRequestStatus,
  OutboxStatus,
  PriceType,
  ProgramStep,
  ReviewStatus,
  ScheduleStatus,
  TourStatus,
} from '@tver/shared';

export interface AdminTourListItem {
  id: string;
  slug: string;
  title: string;
  status: TourStatus;
  price: number;
  priceType: PriceType;
  durationMinutes: number;
  ratingAvg: number;
  ratingCount: number;
  sortOrder: number;
}

export interface AdminImage {
  id: string;
  r2Key: string;
  alt: string | null;
  sortOrder: number;
  variants: Record<string, string>;
}

export interface AdminSchedule {
  id: string;
  startsAt: string;
  capacity: number;
  bookedCount: number;
  status: ScheduleStatus;
}

export interface AdminRoutePoint {
  id: string;
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  sortOrder: number;
}

export interface AdminTourDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  shortDescription: string;
  fullDescription: string;
  program: ProgramStep[];
  price: number;
  priceType: PriceType;
  durationMinutes: number;
  groupMin: number;
  groupMax: number | null;
  meetingPoint: string | null;
  meetingLat: number | null;
  meetingLng: number | null;
  included: string[];
  notIncluded: string[];
  recommendations: string | null;
  status: TourStatus;
  sortOrder: number;
  ratingAvg: number;
  ratingCount: number;
  badges: { slug: string; label: string }[];
  images: AdminImage[];
  routePoints: AdminRoutePoint[];
  schedules: AdminSchedule[];
}

export interface AdminBooking {
  id: string;
  status: BookingStatus;
  paymentStatus: string;
  peopleCount: number;
  totalPrice: number;
  startsAt: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  comment: string | null;
  adminComment: string | null;
  cancelReason: string | null;
  source: string;
  createdAt: string;
  tour: { id: string; slug: string; title: string } | null;
  user: { id: string; name: string; email: string | null } | null;
}

export interface AdminReview {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  createdAt: string;
  tour: { id: string; slug: string; title: string };
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  emailVerifiedAt: string | null;
  telegramChatId: string | null;
  createdAt: string;
  bookingsCount: number;
}

export interface AdminContactRequest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  status: ContactRequestStatus;
  createdAt: string;
}

export interface AdminOutboxItem {
  id: string;
  channel: string;
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface AdminStats {
  bookingsToday: number;
  pendingBookings: number;
  upcomingBookings: number;
  revenue: number;
  pendingReviews: number;
  newRequests: number;
  failedNotifications: number;
  bookingsByDay: { day: string; total: number }[];
  recentBookings: {
    id: string;
    status: BookingStatus;
    contactName: string;
    peopleCount: number;
    totalPrice: number;
    createdAt: string;
    startsAt: string | null;
    tour: { title: string; slug: string } | null;
  }[];
}
