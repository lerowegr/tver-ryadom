'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
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

  // На узком экране восемь бейджей и три селекта занимали почти весь первый
  // экран до карточек, поэтому ниже lg панель убрана под кнопку.
  const [open, setOpen] = useState(false);
  const activeCount =
    activeBadges.size + (searchParams.get('sort') ? 1 : 0) + (searchParams.get('durationMax') ? 1 : 0);

  const panel = (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Тематика экскурсии (можно несколько)">
        {badges.map((badge) => {
          const active = activeBadges.has(badge.slug);
          return (
            <button
              key={badge.slug}
              onClick={() => toggleBadge(badge.slug)}
              aria-pressed={active}
              className={`cursor-pointer border px-5 py-3.5 text-[0.6875rem] font-medium tracking-[0.14em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                active ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink'
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
            className="link-underline text-muted hover:text-ink cursor-pointer px-2 text-[0.6875rem] font-medium tracking-[0.14em] uppercase"
          >
            Сбросить фильтры
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mb-10">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="tour-filters"
        className="border-line text-ink hover:border-ink flex w-full cursor-pointer items-center justify-between border px-5 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden"
      >
        <span className="flex items-center gap-3">
          Фильтры
          {activeCount > 0 ? (
            <span className="bg-ink text-bg px-2 py-0.5 text-[0.625rem] tabular-nums">{activeCount}</span>
          ) : null}
        </span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`h-3.5 w-3.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6.5 4 4 4-4" />
        </svg>
      </button>

      {/* Панель одна на все размеры: на узком экране она сворачивается,
          с lg — всегда раскрыта. Приём grid-template-rows 0fr → 1fr даёт
          плавную высоту без библиотеки анимации, а она здесь и нежелательна:
          компонент живёт внутри <Suspense>. */}
      <div
        id="tour-filters"
        className={`grid overflow-hidden transition-[grid-template-rows,padding-top] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:grid-rows-[1fr] lg:pt-0 ${
          open ? 'grid-rows-[1fr] pt-6' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0">{panel}</div>
      </div>
    </div>
  );
}
