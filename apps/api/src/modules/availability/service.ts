import { availabilityBlocks, type Db } from '@tver/db';
import type { AvailabilityBlockCreateInput } from '@tver/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { validationError } from '../../lib/errors';

/**
 * Занятость экскурсовода: дни и часы, закрытые для записи.
 *
 * Всё считается в московском «стенном» времени. Так закрытие «3 ноября»
 * означает сутки в Твери, а не сутки от полуночи UTC: иначе край дня
 * уезжал бы на три часа и вечер третьего оставался бы открытым.
 */

/** Больше полугода одним махом не закрываем: это уже не отпуск, а пауза в работе. */
const MAX_DAYS = 185;

const mskParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Момент времени → московские дата и время как их видит человек в Твери. */
export function toMskWallClock(moment: Date): { date: string; time: string } {
  const parts: Record<string, string> = {};
  for (const part of mskParts.formatToParts(moment)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Сквозная шкала минут: даёт сравнивать промежутки, переходящие через полночь. */
function scale(date: string, time: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) / 60_000 + minutesOf(time);
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    if (days.length > MAX_DAYS) break;
    cursor = nextDay(cursor);
  }
  return days;
}

export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;

export async function listBlocks(db: Db, from: string, to: string): Promise<AvailabilityBlock[]> {
  return db.query.availabilityBlocks.findMany({
    where: and(gte(availabilityBlocks.date, from), lte(availabilityBlocks.date, to)),
    orderBy: [asc(availabilityBlocks.date), asc(availabilityBlocks.startTime)],
  });
}

/** Закрывает период. На каждый день заводится своя строка — так его легко открыть обратно по дням. */
export async function addBlocks(db: Db, input: AvailabilityBlockCreateInput) {
  const days = enumerateDays(input.from, input.to);
  if (days.length > MAX_DAYS) {
    throw validationError(`За один раз можно закрыть не больше ${MAX_DAYS} дней`);
  }

  await db.insert(availabilityBlocks).values(
    days.map((date) => ({
      id: crypto.randomUUID(),
      date,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      note: input.note ?? null,
    })),
  );

  return listBlocks(db, input.from, input.to);
}

export async function removeBlock(db: Db, id: string): Promise<void> {
  await db.delete(availabilityBlocks).where(eq(availabilityBlocks.id, id));
}

/** Открывает день целиком: и «весь день», и отдельные промежутки внутри него. */
export async function openDay(db: Db, date: string): Promise<void> {
  await db.delete(availabilityBlocks).where(eq(availabilityBlocks.date, date));
}

/**
 * Попадает ли экскурсия в закрытое время.
 *
 * Сравнивается не момент начала, а весь промежуток: если на 15:00 назначена
 * чужая экскурсия, то двухчасовая прогулка с 14:00 всё равно накладывается,
 * и пропустить её было бы хуже всего — накладка вскрылась бы в день выезда.
 */
export async function isBlocked(db: Db, startsAt: Date, durationMinutes: number): Promise<boolean> {
  const start = toMskWallClock(startsAt);
  const finish = toMskWallClock(new Date(startsAt.getTime() + durationMinutes * 60_000));

  const from = scale(start.date, start.time);
  const to = from + durationMinutes;

  const blocks = await listBlocks(db, start.date, finish.date);
  return blocks.some((block) => {
    const blockFrom = scale(block.date, block.startTime ?? '00:00');
    const blockTo = block.endTime ? scale(block.date, block.endTime) : blockFrom + 1440;
    return from < blockTo && blockFrom < to;
  });
}
