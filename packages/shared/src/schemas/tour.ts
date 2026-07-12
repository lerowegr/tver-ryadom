import { z } from 'zod';
import { PRICE_TYPES, TOUR_STATUSES } from '../constants/statuses';
import { coordinatesSchema, paginationSchema, slugSchema } from './common';

export const programStepSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export type ProgramStep = z.infer<typeof programStepSchema>;

export const routePointInputSchema = coordinatesSchema.extend({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

export type RoutePointInput = z.infer<typeof routePointInputSchema>;

export const tourCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(3).max(200),
  subtitle: z.string().trim().max(300).optional(),
  shortDescription: z.string().trim().min(10).max(500),
  fullDescription: z.string().trim().min(10).max(20000),
  program: z.array(programStepSchema).default([]),
  routePoints: z.array(routePointInputSchema).default([]),
  price: z.number().int().positive('Цена указывается в копейках'),
  priceType: z.enum(PRICE_TYPES).default('per_person'),
  durationMinutes: z.number().int().positive(),
  groupMin: z.number().int().min(1).default(1),
  groupMax: z.number().int().min(1).optional(),
  meetingPoint: z.string().trim().max(500).optional(),
  meetingLat: z.number().min(-90).max(90).optional(),
  meetingLng: z.number().min(-180).max(180).optional(),
  included: z.array(z.string().trim().min(1).max(300)).default([]),
  notIncluded: z.array(z.string().trim().min(1).max(300)).default([]),
  recommendations: z.string().trim().max(5000).optional(),
  status: z.enum(TOUR_STATUSES).default('draft'),
  badgeSlugs: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

export const tourUpdateSchema = tourCreateSchema.partial();

export const tourSortOptions = ['popular', 'price_asc', 'price_desc', 'duration', 'rating'] as const;
export type TourSort = (typeof tourSortOptions)[number];

export const tourFilterSchema = paginationSchema.extend({
  badge: z.string().optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  durationMax: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(tourSortOptions).default('popular'),
});

export type TourCreateInput = z.infer<typeof tourCreateSchema>;
export type TourUpdateInput = z.infer<typeof tourUpdateSchema>;
export type TourFilterInput = z.infer<typeof tourFilterSchema>;
