import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cache } from 'react';
import type { ApiResponse, Paginated } from '@tver/shared';
import { site } from '@/config/site';
import { ApiRequestError } from './api';
import type {
  BadgeDto,
  LatestReviewDto,
  ReviewDto,
  ScheduleEntryDto,
  SiteSettings,
  TourCardDto,
  TourDetailDto,
} from './types';

interface ApiBinding {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Серверный запрос к API. На Cloudflare Workers идёт через service binding
 * (fetch между воркерами по *.workers.dev запрещён — ошибка 1042);
 * в next dev и при сборке — обычный fetch.
 */
async function api<T>(path: string): Promise<T> {
  const base =
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
  const url = `${base}/api/v1${path}`;

  let binding: ApiBinding | undefined;
  try {
    binding = (getCloudflareContext().env as { API?: ApiBinding }).API;
  } catch {
    binding = undefined; // вне Workers-рантайма (next dev, next build)
  }

  const res = binding ? await binding.fetch(url) : await fetch(url, { cache: 'no-store' });

  let payload: ApiResponse<T>;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError('internal_error', `API вернул некорректный ответ (${res.status})`);
  }
  if (!payload.success) {
    throw new ApiRequestError(payload.error.code, payload.error.message, payload.error.details);
  }
  return payload.data;
}

/** Настройки сайта; при недоступном API — запасные значения из конфига. */
export const getSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const remote = await api<SiteSettings>('/settings');
    return { ...site.fallbackContacts, ...remote };
  } catch {
    return site.fallbackContacts;
  }
});

export interface TourListQuery {
  page?: string;
  badge?: string;
  sort?: string;
  priceMax?: string;
  durationMax?: string;
  search?: string;
}

export async function getTours(query: TourListQuery = {}): Promise<Paginated<TourCardDto>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  return api<Paginated<TourCardDto>>(`/tours${qs}`);
}

export const getTour = cache((slug: string) => api<TourDetailDto>(`/tours/${encodeURIComponent(slug)}`));

export function getTourReviews(slug: string, page = 1): Promise<Paginated<ReviewDto>> {
  return api<Paginated<ReviewDto>>(`/tours/${encodeURIComponent(slug)}/reviews?page=${page}`);
}

export const getBadges = cache(() => api<BadgeDto[]>('/badges'));

/** Ближайшие сборные выходы по всем экскурсиям. */
export const getSchedule = cache(() => api<{ items: ScheduleEntryDto[] }>('/schedule'));

export function getLatestReviews(): Promise<LatestReviewDto[]> {
  return api<LatestReviewDto[]>('/reviews/latest');
}

/** Безопасная выборка для некритичных блоков: при ошибке API отдаёт fallback. */
export async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}
