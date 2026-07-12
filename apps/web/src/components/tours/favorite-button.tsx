'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers';
import { HeartIcon } from '@/components/ui/icons';
import { useFavorites } from '@/hooks/use-favorites';

/** Сердечко «в избранное»; гостя ведёт на страницу входа. */
export function FavoriteButton({ tourId, className = '' }: { tourId: string; className?: string }) {
  const { status } = useAuth();
  const router = useRouter();
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(tourId);

  return (
    <button
      type="button"
      aria-label={active ? 'Убрать из избранного' : 'Добавить в избранное'}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (status !== 'authed') {
          router.push('/auth?next=' + encodeURIComponent(window.location.pathname));
          return;
        }
        toggle(tourId);
      }}
      className={`glass relative z-10 rounded-full p-2.5 transition-all duration-200 hover:scale-110 active:scale-95 ${
        active ? 'text-terra-600' : 'text-bark-600'
      } ${className}`}
    >
      <HeartIcon className={`h-5 w-5 ${active ? 'fill-terra-500 text-terra-500' : ''}`} />
    </button>
  );
}
