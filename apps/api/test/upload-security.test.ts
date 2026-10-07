import { describe, expect, it } from 'vitest';
import { detectImageType } from '../src/lib/images';
import { TEST_ENV, bearer, body, createAdmin, createTestApp } from './helpers';

describe('P1: загрузка проверяется по сигнатуре', () => {
  it('detectImageType различает JPEG/PNG/WebP и мусор', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(
      detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('image/webp');
    expect(detectImageType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it('полиглот HTML с типом image/jpeg отклоняется 422', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const form = new FormData();
    form.append(
      'file',
      new File(['<html><script>alert(1)</script>'], 'evil.jpg', { type: 'image/jpeg' }),
    );
    const res = await app.request(
      '/api/v1/admin/tours/tour-obzornaya/images',
      { method: 'POST', body: form, headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });

  it('несоответствие заявленного типа содержимому отклоняется', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const form = new FormData();
    form.append('file', new File([png], 'photo.jpg', { type: 'image/jpeg' }));
    const res = await app.request(
      '/api/v1/admin/tours/tour-obzornaya/images',
      { method: 'POST', body: form, headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });

  it('раздача ставит nosniff и честный Content-Type из сигнатуры', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    const form = new FormData();
    // Заявлен webp, внутри PNG — лечь должен image/png из сигнатуры.
    form.append('file', new File([png], 'photo.webp', { type: 'image/webp' }));
    form.append('alt', 'Тест');
    const uploaded = await app.request(
      '/api/v1/admin/tours/tour-obzornaya/images',
      { method: 'POST', body: form, headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    // Несоответствие типа — тоже 422.
    expect(uploaded.status).toBe(422);

    const honest = new FormData();
    honest.append('file', new File([png], 'photo.png', { type: 'image/png' }));
    const okRes = await app.request(
      '/api/v1/admin/tours/tour-obzornaya/images',
      { method: 'POST', body: honest, headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    expect(okRes.status).toBe(201);
    const image = (await body(okRes)).data;
    const key = (image.variants.original as string).replace('http://api.test/images/', '');
    const served = await app.request(`/images/${key}`, {}, TEST_ENV);
    expect(served.headers.get('Content-Type')).toBe('image/png');
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
