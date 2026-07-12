import type { PriceType, ProgramStep } from '@tver/shared';

/** DTO ответов API (см. apps/api/src/modules и docs/api.md). */

export interface BadgeDto {
  slug: string;
  label: string;
}

export interface TourImageDto {
  r2Key: string;
  alt: string | null;
  variants: Record<string, string>;
}

export interface TourCardDto {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  shortDescription: string;
  price: number;
  priceType: PriceType;
  durationMinutes: number;
  groupMin: number;
  groupMax: number | null;
  ratingAvg: number;
  ratingCount: number;
  image: TourImageDto | null;
  badges: BadgeDto[];
  routePoints: string[];
}

export interface ScheduleDto {
  id: string;
  startsAt: string;
  capacity: number;
  freeSeats: number;
}

export interface RoutePointDto {
  title: string;
  description: string | null;
  lat: number;
  lng: number;
}

export interface TourDetailDto {
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
  ratingAvg: number;
  ratingCount: number;
  images: TourImageDto[];
  badges: BadgeDto[];
  routePoints: RoutePointDto[];
  schedules: ScheduleDto[];
}

export interface ReviewDto {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  createdAt: string;
}

export interface LatestReviewDto extends ReviewDto {
  tour: { slug: string; title: string };
}

export interface BookingCreatedDto {
  id: string;
  status: 'pending';
  totalPrice: number;
  startsAt: string | null;
  tour: { id: string; slug: string; title: string };
}

export type SiteSettings = Record<string, string>;

export interface PublicUserDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  emailVerified: boolean;
  telegramLinked: boolean;
  createdAt: string;
}

export interface MyBookingDto {
  id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded';
  peopleCount: number;
  totalPrice: number;
  startsAt: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  comment: string | null;
  cancelReason: string | null;
  createdAt: string;
  tour: { id: string; slug: string; title: string } | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface FavoriteDto {
  addedAt: string;
  tour: TourCardDto;
}
