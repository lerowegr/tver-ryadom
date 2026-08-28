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
      className={`bg-bg/90 text-ink relative z-10 cursor-pointer p-3.5 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`}
    >
      <HeartIcon className={`h-4 w-4 ${active ? 'fill-ink' : ''}`} />
    </button>
  );
}
