import { describe, expect, it } from 'vitest';
import { safeLogPath } from '../src/app';

describe('H7: секреты не попадают в логи', () => {
  it('маскирует секрет вебхука Telegram', () => {
    expect(safeLogPath('/webhook/telegram/abc123secret')).toBe('/webhook/telegram/…');
  });

  it('маскирует токен ленты календаря', () => {
    expect(safeLogPath('/calendar/deadbeef00112233.ics')).toBe('/calendar/…');
  });

  it('обычные пути пишет как есть', () => {
    expect(safeLogPath('/api/v1/tours')).toBe('/api/v1/tours');
    expect(safeLogPath('/webhook/vk')).toBe('/webhook/vk');
    expect(safeLogPath('/health')).toBe('/health');
  });
});
