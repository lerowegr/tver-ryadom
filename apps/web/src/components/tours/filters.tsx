'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { BadgeDto } from '@/lib/types';

const sortOptions = [
  { value: 'popular', label: 'Сначала популярные' },
  { value: 'price_asc', label: 'Дешевле' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'duration', label: 'Короче по времени' },
  { value: 'rating', label: 'По рейтингу' },
];

const durationOptions = [
  { value: '', label: 'Любая длительность' },
  { value: '120', label: 'До 2 часов' },
  { value: '240', label: 'До 4 часов' },
];

export function TourFilters({ badges }: { badges: BadgeDto[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete('page'); // при смене фильтра возвращаемся на первую страницу
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const activeBadge = searchParams.get('badge');
  const hasFilters = ['badge', 'sort', 'durationMax', 'search'].some((k) => searchParams.get(k));

  return (
    <div className="mb-10 space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Тематика экскурсии">
        {badges.map((badge) => {
          const active = activeBadge === badge.slug;
          return (
            <button
              key={badge.slug}
              onClick={() => update({ badge: active ? null : badge.slug })}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? 'bg-terra-500 shadow-card text-white'
                  : 'text-bark-700 hover:border-bark-500/60 border border-transparent bg-white'
              }`}
            >
              {badge.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={searchParams.get('sort') ?? 'popular'}
          onChange={(e) => update({ sort: e.target.value === 'popular' ? null : e.target.value })}
          aria-label="Сортировка"
          className="border-sand-300 text-bark-800 focus:outline-terra-500 rounded-full border bg-white px-4 py-2.5 text-sm font-medium"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get('durationMax') ?? ''}
          onChange={(e) => update({ durationMax: e.target.value || null })}
          aria-label="Длительность"
          className="border-sand-300 text-bark-800 focus:outline-terra-500 rounded-full border bg-white px-4 py-2.5 text-sm font-medium"
        >
          {durationOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <button
            onClick={() => router.replace(pathname, { scroll: false })}
            className="text-bark-600 hover:text-terra-600 px-2 text-sm font-medium underline-offset-4 hover:underline"
          >
            Сбросить фильтры
          </button>
        ) : null}
      </div>
    </div>
  );
}
