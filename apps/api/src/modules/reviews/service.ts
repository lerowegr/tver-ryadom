import type { Db } from '@tver/db';
import { reviews, tours, users } from '@tver/db';
import type { ReviewCreateInput } from '@tver/shared';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '../../env';
import { conflict, notFound, validationError } from '../../lib/errors';

/** Свежие одобренные отзывы для главной страницы. */
export async function listLatestReviews(db: Db, limit = 6) {
  return db.query.reviews.findMany({
    where: eq(reviews.status, 'approved'),
    orderBy: (review, { desc: sortDesc }) => [sortDesc(review.createdAt)],
    limit,
    columns: { id: true, authorName: true, rating: true, text: true, createdAt: true },
    with: { tour: { columns: { slug: true, title: true } } },
  });
}

export async function createReview(db: Db, input: ReviewCreateInput, user?: AuthUser) {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.id, input.tourId), eq(tours.status, 'published')),
    columns: { id: true },
  });
  if (!tour) throw notFound('Экскурсия не найдена');

  let authorName = input.authorName;
  if (user) {
    const author = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { name: true },
    });
    authorName = author?.name ?? authorName;

    const existing = await db.query.reviews.findFirst({
      where: and(eq(reviews.tourId, tour.id), eq(reviews.userId, user.id)),
      columns: { id: true },
    });
    if (existing) throw conflict('Вы уже оставляли отзыв на эту экскурсию');
  }
  if (!authorName) {
    throw validationError('Укажите имя', { authorName: 'Укажите имя' });
  }

  const id = crypto.randomUUID();
  await db.insert(reviews).values({
    id,
    tourId: tour.id,
    userId: user?.id ?? null,
    authorName,
    rating: input.rating,
    text: input.text,
    status: 'pending',
  });

  // Отзыв появится на сайте после модерации в админке (этап 5).
  return { id, status: 'pending' as const };
}
