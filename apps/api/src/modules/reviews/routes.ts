import { reviewCreateSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { createReview, listLatestReviews } from './service';

export const reviewRoutes = new Hono<AppEnv>()
  .get('/latest', async (c) => {
    return ok(c, await listLatestReviews(c.get('db')));
  })

  // Отзывы принимаются и от гостей; при наличии токена автор берётся из профиля.
  .post('/', validate('json', reviewCreateSchema), async (c) => {
    const review = await createReview(c.get('db'), c.req.valid('json'), c.get('user'));
    return ok(c, review, 201);
  });
