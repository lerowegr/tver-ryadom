import type { Db } from '@tver/db';
import { users } from '@tver/db';
import { seedDatabase } from '@tver/db/seed';
import { createTestDb } from '@tver/db/testing';
import { buildApp } from '../src/app';
import type { Bindings } from '../src/env';
import { hashPassword } from '../src/lib/crypto';
import { __resetRateLimits } from '../src/lib/rate-limit';

/** In-memory замена R2 для тестов загрузки изображений. */
class MockR2 {
  store = new Map<string, { data: ArrayBuffer; contentType?: string }>();

  async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.store.set(key, { data: value, contentType: opts?.httpMetadata?.contentType });
  }

  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: new Response(item.data).body,
      httpMetadata: { contentType: item.contentType },
      httpEtag: 'test-etag',
    };
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

export const mockImages = new MockR2();

export const TEST_ENV: Bindings = {
  // DB не используется: в buildApp подставляется тестовая БД.
  DB: undefined as unknown as Bindings['DB'],
  IMAGES: mockImages as unknown as Bindings['IMAGES'],
  IMAGES_BASE_URL: 'http://api.test/images',
  JWT_SECRET: 'test-secret',
  ENVIRONMENT: 'development',
  CORS_ORIGINS: 'http://localhost:3000',
};

export type TestApp = ReturnType<typeof buildApp>;

export interface TestContext {
  app: TestApp;
  db: Db;
}

export async function createTestApp(): Promise<TestContext> {
  // Изоляция rate-limit между тестами: в тестах у всех запросов один IP,
  // без сброса лимиты Register/Login съедали бы соседние сьюты (H4).
  __resetRateLimits();
  const db = createTestDb();
  await seedDatabase(db);
  return { app: buildApp({ db }), db };
}

export function jsonInit(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- в тестах ответы разбираются без строгой типизации */
export async function body(res: Response): Promise<any> {
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Достаёт пару refresh_token=... из заголовка Set-Cookie. */
export function refreshCookieOf(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/refresh_token=[^;]+/);
  if (!match) throw new Error(`Нет refresh-куки в ответе: ${setCookie}`);
  return match[0];
}

export interface TestUser {
  accessToken: string;
  refreshCookie: string;
  user: { id: string; email: string; name: string };
}

let userCounter = 0;

export async function registerUser(
  app: TestApp,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<TestUser> {
  userCounter += 1;
  const input = {
    name: overrides.name ?? `Пользователь ${userCounter}`,
    email: overrides.email ?? `user${userCounter}@example.com`,
    password: overrides.password ?? 'password123',
  };
  const res = await app.request('/api/v1/auth/register', jsonInit(input), TEST_ENV);
  if (res.status !== 201) throw new Error(`Регистрация не удалась: ${await res.text()}`);
  const data = (await body(res)).data;
  return {
    accessToken: data.accessToken,
    refreshCookie: refreshCookieOf(res),
    user: data.user,
  };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

let adminCounter = 0;

/** Создаёт администратора напрямую в БД и логинится через API. */
export async function createAdmin(app: TestApp, db: Db): Promise<TestUser> {
  adminCounter += 1;
  const email = `admin${adminCounter}@test.ru`;
  const password = 'admin-pass-123';
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    name: `Админ ${adminCounter}`,
    role: 'admin',
    passwordHash: await hashPassword(password),
  });

  const res = await app.request('/api/v1/auth/login', jsonInit({ email, password }), TEST_ENV);
  if (res.status !== 200) throw new Error(`Логин админа не удался: ${await res.text()}`);
  const data = (await body(res)).data;
  return { accessToken: data.accessToken, refreshCookie: refreshCookieOf(res), user: data.user };
}
