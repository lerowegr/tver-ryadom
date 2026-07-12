import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Db } from '@tver/db';
import type { UserRole } from '@tver/shared';

export interface Bindings {
  DB: D1Database;
  /** Бакет с фотографиями экскурсий и галереи. */
  IMAGES: R2Bucket;
  /** Секрет подписи JWT: в проде — wrangler secret, локально — .dev.vars. */
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  /** Разрешённые origin'ы через запятую. */
  CORS_ORIGINS?: string;
  /** База публичных URL картинок (route GET /images/*). */
  IMAGES_BASE_URL?: string;
}

export interface AuthUser {
  id: string;
  role: UserRole;
  sessionId: string;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    db: Db;
    user?: AuthUser;
  };
};
