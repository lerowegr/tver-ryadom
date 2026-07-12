import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { imagesBaseOf } from '../../lib/images';
import { ok } from '../../lib/respond';
import { requireAuth } from '../../middleware/auth';
import { addFavorite, listFavorites, removeFavorite } from './service';

export const favoriteRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const user = c.get('user')!;
    return ok(c, await listFavorites(c.get('db'), user.id, imagesBaseOf(c)));
  })

  .put('/:tourId', async (c) => {
    const user = c.get('user')!;
    await addFavorite(c.get('db'), user.id, c.req.param('tourId'));
    return ok(c, { added: true }, 201);
  })

  .delete('/:tourId', async (c) => {
    const user = c.get('user')!;
    await removeFavorite(c.get('db'), user.id, c.req.param('tourId'));
    return ok(c, { removed: true });
  });
