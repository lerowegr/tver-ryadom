import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Paginated } from '@tver/shared';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true as const, data }, status);
}

export function paginated<T>(
  c: Context,
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  const body: Paginated<T> = {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
  return ok(c, body);
}
