import type { ProgramStep, RoutePointInput } from '@tver/shared';

/** Описание экскурсии в seed-данных. */
export interface SeedTour {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  fullDescription: string;
  program: ProgramStep[];
  price: number;
  priceType: 'per_person' | 'per_group';
  durationMinutes: number;
  groupMin: number;
  groupMax: number | null;
  meetingPoint: string;
  meetingLat: number;
  meetingLng: number;
  included: string[];
  notIncluded: string[];
  recommendations: string;
  badgeSlugs: string[];
  routePoints: (RoutePointInput & { id: string })[];
  sortOrder: number;
}

export interface SeedReview {
  id: string;
  tourId: string;
  authorName: string;
  rating: number;
  text: string;
  /** Дата отзыва на площадке, откуда он перенесён. */
  createdAt: Date;
}
