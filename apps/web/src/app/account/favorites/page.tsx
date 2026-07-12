'use client';

import Link from 'next/link';
import { TourCard } from '@/components/tours/tour-card';
import { useFavorites } from '@/hooks/use-favorites';

export default function FavoritesPage() {
  const { favorites, isLoading } = useFavorites();

  if (isLoading) {
    return <p className="text-bark-600 animate-pulse py-10 text-center">Загружаем избранное…</p>;
  }

  if (favorites.length === 0) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <p className="text-ink-900 text-lg font-semibold">В избранном пока пусто</p>
        <p className="text-bark-700 mt-2 text-sm">
          Нажимайте на сердечко у экскурсии, чтобы вернуться к ней позже.
        </p>
        <Link
          href="/excursions"
          className="bg-terra-500 hover:bg-terra-600 mt-6 inline-block rounded-full px-7 py-3 text-sm font-semibold text-white transition"
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
