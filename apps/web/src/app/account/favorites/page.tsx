'use client';

import Link from 'next/link';
import { TourCard } from '@/components/tours/tour-card';
import { useFavorites } from '@/hooks/use-favorites';

export default function FavoritesPage() {
  const { favorites, isLoading } = useFavorites();

  if (isLoading) {
    return <p className="text-muted animate-pulse py-10 text-center">Загружаем избранное…</p>;
  }

  if (favorites.length === 0) {
    return (
      <div className="border-line border-t py-16 text-center">
        <p className="text-ink text-lg font-medium">В избранном пока пусто</p>
        <p className="text-muted mt-2 text-sm">
          Нажимайте на сердечко у экскурсии, чтобы вернуться к ней позже.
        </p>
        <Link
          href="/excursions"
          className="bg-ink text-bg hover:bg-ink-soft mt-8 inline-block cursor-pointer px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
        >
          Смотреть экскурсии
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {favorites.map((favorite) => (
        <TourCard key={favorite.tour.id} tour={favorite.tour} />
      ))}
    </div>
  );
}
