import { reviewCreateSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { rateLimit, rateLimits } from '../../lib/rate-limit';
import { ok } from '../../lib/respond';
import { requireCaptchaForGuest } from '../../lib/turnstile';
import { resolveOptionalUser } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createReview, listLatestReviews } from './service';

export const reviewRoutes = new Hono<AppEnv>()
  .get('/latest', async (c) => {
    return ok(c, await listLatestReviews(c.get('db')));
  })

  // Отзывы принимаются и от гостей; при наличии токена автор берётся из профиля.
  .post('/', rateLimit(rateLimits.reviewCreate), validate('json', reviewCreateSchema), async (c) => {
    const input = c.req.valid('json');
    await requireCaptchaForGuest(c, input.cfToken);
    const user = await resolveOptionalUser(c.get('db'), c.get('user'));
    const review = await createReview(c.get('db'), input, user);
    return ok(c, review, 201);
  });
