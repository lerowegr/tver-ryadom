import type { Db } from '@tver/db';
import { favorites, tours } from '@tver/db';
import { and, eq } from 'drizzle-orm';
import { notFound } from '../../lib/errors';
import { toTourCard } from '../tours/service';

export async function listFavorites(db: Db, userId: string, imagesBase: string) {
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    orderBy: (favorite, { desc: sortDesc }) => [sortDesc(favorite.createdAt)],
    with: {
      tour: {
        with: {
          images: { orderBy: (image, { asc: sortAsc }) => [sortAsc(image.sortOrder)], limit: 1 },
          badges: { with: { badge: { columns: { slug: true, label: true } } } },
        },
      },
    },
  });
  return rows
    .filter((row) => row.tour.status === 'published')
    .map((row) => ({ addedAt: row.createdAt, tour: toTourCard(row.tour, imagesBase) }));
}

export async function addFavorite(db: Db, userId: string, tourId: string) {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.id, tourId), eq(tours.status, 'published')),
    columns: { id: true },
  });
  if (!tour) throw notFound('Экскурсия не найдена');
  await db.insert(favorites).values({ userId, tourId }).onConflictDoNothing();
}

export async function removeFavorite(db: Db, userId: string, tourId: string) {
  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.tourId, tourId)));
}
