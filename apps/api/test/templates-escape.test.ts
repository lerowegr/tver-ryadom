import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@tver/shared';
import { renderTemplate } from '../src/modules/notifications/templates';

describe('H1: экранирование шаблонов уведомлений', () => {
  it('escapeHtml чистит базовые сущности', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('admin_new_request не выпускает HTML из message/name', () => {
    const evil = '<img src=x onerror=alert(1)><a href="https://evil">клик</a>';
    const out = renderTemplate('admin_new_request', {
      contactName: '<b>Елена</b>',
      contactPhone: '+79001112233',
      message: evil,
    });
    expect(out.text).not.toContain('<img');
    expect(out.text).not.toContain('<a href');
    expect(out.text).toContain('&lt;img');
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;img');
  });

  it('admin_new_booking чистит имя/телефон/комментарий', () => {
    const out = renderTemplate('admin_new_booking', {
      tourTitle: 'Обзорная <script>alert(1)</script>',
      contactName: '</b><a href=https://evil>взлом</a>',
      contactPhone: '<u>123</u>',
      comment: '"><svg onload=alert(1)>',
    });
    for (const body of [out.text, out.html]) {
      expect(body).not.toContain('<script>');
      expect(body).not.toContain('<svg');
      expect(body).not.toContain('<a href=https://evil>');
    }
    expect(out.text).toContain('&lt;script&gt;');
  });

  it('booking_cancelled чистит комментарий клиента', () => {
    const out = renderTemplate('booking_cancelled', {
      tourTitle: 'Тур',
      comment: '</p><script>alert(1)</script>',
    });
    expect(out.html).not.toContain('</p><script>');
    expect(out.html).toContain('&lt;/p&gt;&lt;script&gt;');
  });

  it('неизвестный шаблон не выпускает JSON как HTML', () => {
    const out = renderTemplate('nope', { message: '</pre><script>alert(1)</script>' } as never);
    expect(out.html).not.toContain('</pre><script>');
    expect(out.html).toContain('&lt;/pre&gt;');
  });

  it('siteUrl в href экранируется', () => {
    const out = renderTemplate('booking_created', {
      tourTitle: 'Тур',
      siteUrl: 'https://site.ru/" onmouseover="alert(1)',
    });
    expect(out.html).not.toContain('" onmouseover="');
    expect(out.html).toContain('&quot; onmouseover=&quot;');
  });
});
