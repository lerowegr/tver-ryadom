import type { D1Database } from '@cloudflare/workers-types';
import type { Db } from '@tver/db';
import type { UserRole } from '@tver/shared';

export interface Bindings {
  DB: D1Database;
  /** Секрет подписи JWT: в проде — wrangler secret, локально — .dev.vars. */
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  /** Разрешённые origin'ы через запятую. */
  CORS_ORIGINS?: string;
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
