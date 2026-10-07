import { describe, expect, it, vi } from 'vitest';
import { __resetRateLimits, clientIp, rateLimit } from '../src/lib/rate-limit';
import { verifyTurnstile } from '../src/lib/turnstile';
import { TEST_ENV, createTestApp, jsonInit } from './helpers';

describe('H4: rate-limit режет флуд', () => {
  it('clientIp берёт cf-connecting-ip, затем x-forwarded-for', () => {
    const cf = { req: { header: (n: string) => (n === 'cf-connecting-ip' ? '1.2.3.4' : undefined) } };
    expect(clientIp(cf as never)).toBe('1.2.3.4');
    const fwd = { req: { header: (n: string) => (n === 'x-forwarded-for' ? '5.6.7.8, 9.9.9.9' : undefined) } };
    expect(clientIp(fwd as never)).toBe('5.6.7.8');
  });

  it('превышение лимита даёт 429 с Retry-After в том же конверте', async () => {
    __resetRateLimits();
    const { Hono } = await import('hono');
    const app = new Hono().get('/t', rateLimit({ limit: 2, windowSec: 60, prefix: 'test' }), (c) =>
      c.json({ ok: true }),
    );
    expect((await app.request('/t')).status).toBe(200);
    expect((await app.request('/t')).status).toBe(200);
    const blocked = await app.request('/t');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    const body = await blocked.json();
    expect(body).toMatchObject({ success: false, error: { code: 'rate_limited' } });
    __resetRateLimits();
  });

  it('login после 10 попыток отдаёт 429', async () => {
    __resetRateLimits();
    const { app } = await createTestApp();
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await app.request(
        '/api/v1/auth/login',
        jsonInit({ email: 'nobody@example.com', password: 'wrong-pass-123' }),
        TEST_ENV,
      );
      last = res.status;
    }
    expect(last).toBe(429);
    __resetRateLimits();
  });

  it('contact после 5 заявок отдаёт 429', async () => {
    __resetRateLimits();
    const { app } = await createTestApp();
    const payload = { name: 'Тест', phone: '+79001112233', message: 'Привет, это проверка связи' };
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      last = (await app.request('/api/v1/contact', jsonInit(payload), TEST_ENV)).status;
    }
    expect(last).toBe(429);
    __resetRateLimits();
  });

  it('вебхук VK без секрета режется лимитом после 60 запросов', async () => {
    __resetRateLimits();
    const { app } = await createTestApp();
    let last = 0;
    for (let i = 0; i < 61; i += 1) {
      last = (await app.request('/webhook/vk', jsonInit({ type: 'ping' }), TEST_ENV)).status;
    }
    // Первые 60 — 403 (fail-closed H3), 61-й — 429 лимит
    expect(last).toBe(429);
    __resetRateLimits();
  });
});

describe('M6: капча Turnstile (каркас)', () => {
  it('без секрета проверка пропускается', async () => {
    await expect(verifyTurnstile(undefined, undefined)).resolves.toMatchObject({
      ok: true,
      skipped: true,
    });
  });

  it('с секретом, но без токена — не проходит', async () => {
    await expect(verifyTurnstile('secret', undefined)).resolves.toMatchObject({ ok: false });
  });

  it('с секретом ходит в siteverify и читает success', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await verifyTurnstile('secret', 'token', '1.2.3.4');
      expect(result).toMatchObject({ ok: true, skipped: false });
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(String(init.body)).toContain('secret');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('недоступность siteverify — не проходит, а не падает', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))));
    try {
      await expect(verifyTurnstile('secret', 'token')).resolves.toMatchObject({ ok: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
