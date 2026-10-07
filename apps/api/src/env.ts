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
  /** Публичный URL сайта — для ссылок в письмах и боте. */
  SITE_URL?: string;
  /**
   * SameSite refresh-куки. На *.workers.dev поддомены — разные сайты
   * (Public Suffix List), поэтому нужен "none"; на своём домене — "lax".
   */
  COOKIE_SAMESITE?: string;
  /** Токен бота от BotFather (secret). Пусто — Telegram-канал выключен. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Username бота без @ — для deep-link привязки аккаунта. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Секрет в URL вебхука, чтобы посторонние не слали апдейты (secret). */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Токен сообщества ВКонтакте (secret). Пусто — канал выключен. */
  VK_GROUP_TOKEN?: string;
  /** Токен бота MAX (secret). Пусто — канал выключен. */
  MAX_BOT_TOKEN?: string;
  /** Ключ Resend (secret). Пусто — email-канал выключен. */
  RESEND_API_KEY?: string;
  /** Адрес отправителя писем, например "Тверь рядом <hello@tver-ryadom.ru>". */
  EMAIL_FROM?: string;
  /**
   * Секрет Cloudflare Turnstile (secret). Пусто — капча пропущена везде.
   * Задать: `wrangler secret put TURNSTILE_SECRET` + виджет на фронте.
   */
  TURNSTILE_SECRET?: string;
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
