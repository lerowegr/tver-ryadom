import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@tver/shared';
import { users } from '@tver/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../../env';
import { clearRefreshCookie, getRefreshCookie, isTrustedOrigin, setRefreshCookie } from '../../lib/cookies';
import { forbidden, unauthorized, validationError } from '../../lib/errors';
import { readCheckedImage } from '../../lib/images';
import { rateLimit, rateLimits } from '../../lib/rate-limit';
import { ok } from '../../lib/respond';
import { requireCaptchaForGuest } from '../../lib/turnstile';
import { imagesBaseOf } from '../../lib/images';
import { resolveBotUsername } from '../bot/setup';
import { createLinkCode } from '../../lib/tg-link';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  changePassword,
  confirmPasswordReset,
  getMe,
  listSessions,
  login,
  loginByWebApp,
  logoutByRefreshToken,
  refreshSession,
  register,
  requestPasswordReset,
  revokeSession,
  updateProfile,
} from './service';

function requestMeta(c: Context<AppEnv>) {
  return {
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('cf-connecting-ip'),
  };
}

export const authRoutes = new Hono<AppEnv>()
  .post('/register', rateLimit(rateLimits.register), validate('json', registerSchema), async (c) => {
    const input = c.req.valid('json');
    await requireCaptchaForGuest(c, input.cfToken);
    const result = await register(c.get('db'), c.env.JWT_SECRET, input, requestMeta(c));
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken }, 201);
  })

  .post('/login', rateLimit(rateLimits.login), validate('json', loginSchema), async (c) => {
    const result = await login(c.get('db'), c.env.JWT_SECRET, c.req.valid('json'), requestMeta(c));
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken });
  })

  .post('/refresh', rateLimit(rateLimits.refresh), async (c) => {
    // Cookie-only endpoint: режем кросс-сайтовые формы до чтения куки (M1).
    if (!isTrustedOrigin(c)) throw forbidden('Недопустимый источник запроса');
    const token = getRefreshCookie(c);
    if (!token) throw unauthorized('Нет refresh-токена');
    const result = await refreshSession(c.get('db'), c.env.JWT_SECRET, token);
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken });
  })

  .post('/logout', async (c) => {
    if (!isTrustedOrigin(c)) throw forbidden('Недопустимый источник запроса');
    const token = getRefreshCookie(c);
    if (token) await logoutByRefreshToken(c.get('db'), token);
    clearRefreshCookie(c);
    return ok(c, { loggedOut: true });
  })

  .get('/me', requireAuth, async (c) => {
    const user = c.get('user')!;
    return ok(c, await getMe(c.get('db'), user.id));
  })

  .patch('/profile', requireAuth, validate('json', updateProfileSchema), async (c) => {
    const user = c.get('user')!;
    return ok(c, await updateProfile(c.get('db'), user.id, c.req.valid('json')));
  })

  .post('/change-password', requireAuth, validate('json', changePasswordSchema), async (c) => {
    const user = c.get('user')!;
    await changePassword(c.get('db'), user.id, user.sessionId, c.req.valid('json'));
    return ok(c, { changed: true });
  })

  /** Активные сессии («устройства»): без хешей токенов. */
  .get('/sessions', requireAuth, async (c) => {
    const user = c.get('user')!;
    return ok(c, await listSessions(c.get('db'), user.id));
  })

  /** Отзыв одной своей сессии (например, потерянного устройства). */
  .delete('/sessions/:id', requireAuth, async (c) => {
    const user = c.get('user')!;
    await revokeSession(c.get('db'), user.id, c.req.param('id'));
    return ok(c, { revoked: true });
  })

  /**
   * Заявка на восстановление пароля. Всегда 200 — иначе перебор email
   * (существует/нет) по ответу. Письмо уходит только email-каналом.
   */
  .post(
    '/password-reset/request',
    rateLimit(rateLimits.passwordReset),
    validate('json', requestPasswordResetSchema),
    async (c) => {
      const input = c.req.valid('json');
      await requireCaptchaForGuest(c, input.cfToken);
      await requestPasswordReset(c.get('db'), c.env.JWT_SECRET, c.env.SITE_URL, input.email);
      return ok(c, { requested: true });
    },
  )

  /** Сброс пароля по токену из письма + сразу вход. */
  .post(
    '/password-reset/confirm',
    rateLimit(rateLimits.passwordReset),
    validate('json', resetPasswordSchema),
    async (c) => {
      const input = c.req.valid('json');
      const result = await confirmPasswordReset(
        c.get('db'),
        c.env.JWT_SECRET,
        input.token,
        input.password,
        requestMeta(c),
      );
      setRefreshCookie(c, result.refreshToken);
      return ok(c, { user: result.user, accessToken: result.accessToken });
    },
  )

  /**
   * Загрузка аватара. Кадрирует пользователь в кабинете, сюда приходит уже
   * готовый квадрат — сервер только кладёт его в хранилище. Ключ всегда один
   * и тот же, поэтому старый файл перезаписывается и мусор не копится.
   */
  .post('/avatar', requireAuth, async (c) => {
    const user = c.get('user')!;
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw validationError('Приложите изображение в поле file');

    // Тип — по сигнатуре файла, заявленный Content-Type игнорируется (P1/M3).
    let checked;
    try {
      checked = await readCheckedImage(file, 2 * 1024 * 1024);
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'Некорректное изображение');
    }

    const key = `avatars/${user.id}.webp`;
    await c.env.IMAGES.put(key, checked.bytes, {
      httpMetadata: { contentType: checked.contentType, cacheControl: 'public, max-age=60' },
    });
    await c.get('db').update(users).set({ avatarKey: key }).where(eq(users.id, user.id));

    return ok(c, { avatarUrl: `${imagesBaseOf(c)}/${key}?v=${Date.now()}` });
  })

  .delete('/avatar', requireAuth, async (c) => {
    const user = c.get('user')!;
    const key = `avatars/${user.id}.webp`;
    await c.env.IMAGES.delete(key);
    await c.get('db').update(users).set({ avatarKey: null }).where(eq(users.id, user.id));
    return ok(c, { avatarUrl: null });
  })

  /** Deep-link для привязки Telegram-аккаунта (код живёт 15 минут). */
  /**
   * Вход из мини-приложения Telegram.
   *
   * Пароль здесь не нужен: личность подтверждает сам Telegram подписью в
   * initData. Проверяем её на сервере — присланному без проверки верить
   * нельзя, подделать строку тривиально.
   */
  .post('/telegram-webapp', rateLimit(rateLimits.telegramWebapp), async (c) => {
    if (!c.env.TELEGRAM_BOT_TOKEN) throw validationError('Telegram-бот не подключён');
    const payload = await c.req
      .json<{ initData?: string }>()
      .catch(() => ({}) as { initData?: string });
    const result = await loginByWebApp(
      c.get('db'),
      c.env.JWT_SECRET,
      c.env.TELEGRAM_BOT_TOKEN,
      payload.initData ?? '',
      requestMeta(c),
    );
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken });
  })

  .get('/telegram-link', requireAuth, async (c) => {
    // Имя бота приходит либо из переменной окружения, либо из настроек —
    // туда его записывает подключение бота в админке.
    const username = await resolveBotUsername(c.get('db'), c.env);
    if (!username) return ok(c, { available: false as const });
    const user = c.get('user')!;
    const code = await createLinkCode(c.env.JWT_SECRET, user.id);
    return ok(c, {
      available: true as const,
      url: `https://t.me/${username}?start=${code}`,
    });
  });
