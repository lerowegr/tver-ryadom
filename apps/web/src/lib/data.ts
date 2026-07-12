import { cache } from 'react';
import type { Paginated } from '@tver/shared';
import { site } from '@/config/site';
import { api } from './api';
import type { BadgeDto, LatestReviewDto, ReviewDto, SiteSettings, TourCardDto, TourDetailDto } from './types';

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
