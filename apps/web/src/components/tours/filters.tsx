'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Select } from '@/components/ui/select';
import type { BadgeDto } from '@/lib/types';

type SortField = 'popular' | 'rating' | 'price' | 'duration';
type SortDir = 'asc' | 'desc';

const fieldOptions: { value: SortField; label: string }[] = [
  { value: 'popular', label: 'Сначала популярные' },
  { value: 'rating', label: 'По рейтингу' },
  { value: 'price', label: 'По цене' },
  { value: 'duration', label: 'По длительности' },
];

const dirOptions: { value: SortDir; label: string }[] = [
  { value: 'desc', label: 'По убыванию' },
  { value: 'asc', label: 'По возрастанию' },
];

const durationOptions = [
  { value: '', label: 'Любая длительность' },
  { value: '120', label: 'До 2 часов' },
  { value: '240', label: 'До 4 часов' },
];

/** «rating_desc» → { field: 'rating', dir: 'desc' } */
function parseSort(sort: string | null): { field: SortField; dir: SortDir } {
  if (!sort || sort === 'popular') return { field: 'popular', dir: 'desc' };
  const idx = sort.lastIndexOf('_');
  const field = sort.slice(0, idx) as SortField;
  const dir = sort.slice(idx + 1) as SortDir;
  if (!['rating', 'price', 'duration'].includes(field) || !['asc', 'desc'].includes(dir)) {
    return { field: 'popular', dir: 'desc' };
  }
  return { field, dir };
}

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

  const activeBadges = new Set(
    (searchParams.get('badge') ?? '')
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  );

  const toggleBadge = (slug: string) => {
    const next = new Set(activeBadges);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    update({ badge: next.size > 0 ? [...next].join(',') : null });
  };

  const { field, dir } = parseSort(searchParams.get('sort'));

  const setSort = (nextField: SortField, nextDir: SortDir) => {
    update({ sort: nextField === 'popular' ? null : `${nextField}_${nextDir}` });
  };

  const hasFilters = ['badge', 'sort', 'durationMax', 'search'].some((k) => searchParams.get(k));

  return (
    <div className="mb-10 space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Тематика экскурсии (можно несколько)">
        {badges.map((badge) => {
          const active = activeBadges.has(badge.slug);
          return (
            <button
              key={badge.slug}
              onClick={() => toggleBadge(badge.slug)}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                active
                  ? 'bg-terra-500 shadow-card scale-[1.03] text-white'
                  : 'text-bark-700 hover:border-bark-500/60 border border-transparent bg-white'
              }`}
            >
              {badge.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={field}
          onChange={(e) => setSort(e.target.value as SortField, dir)}
          aria-label="Поле сортировки"
        >
          {fieldOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <Select
          value={dir}
          onChange={(e) => setSort(field, e.target.value as SortDir)}
          aria-label="Направление сортировки"
          disabled={field === 'popular'}
          title={field === 'popular' ? 'Выберите поле сортировки' : undefined}
        >
          {dirOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('durationMax') ?? ''}
          onChange={(e) => update({ durationMax: e.target.value || null })}
          aria-label="Длительность"
        >
          {durationOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        {hasFilters ? (
          <button
            onClick={() => router.replace(pathname, { scroll: false })}
            className="text-bark-600 hover:text-terra-600 px-2 text-sm font-medium underline-offset-4 transition-colors hover:underline"
          >
            Сбросить фильтры
          </button>
        ) : null}
      </div>
    </div>
  );
}
