'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/providers';
import { authFetch } from '@/lib/auth';
import type { FavoriteDto } from '@/lib/types';

export function useFavorites() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: () => authFetch<FavoriteDto[]>('/favorites'),
    enabled: status === 'authed',
  });

  const favoriteIds = new Set((query.data ?? []).map((f) => f.tour.id));

  const toggle = useMutation({
    mutationFn: ({ tourId, add }: { tourId: string; add: boolean }) =>
      authFetch(`/favorites/${tourId}`, { method: add ? 'PUT' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  return {
    favorites: query.data ?? [],
    isLoading: status === 'authed' && query.isLoading,
    favoriteIds,
    isFavorite: (tourId: string) => favoriteIds.has(tourId),
    toggle: (tourId: string) => toggle.mutate({ tourId, add: !favoriteIds.has(tourId) }),
    toggling: toggle.isPending,
  };
}
