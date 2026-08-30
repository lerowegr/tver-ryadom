import { bookings, schedules, settings, tours, type Db } from '@tver/db';
import { and, asc, eq, gte, inArray, lte, ne, or } from 'drizzle-orm';

/** Ключ настройки, под которым лежит секрет ленты. */
const TOKEN_KEY = 'calendar.feedToken';

export interface CalendarSlot {
  id: string;
  kind: 'slot';
  tourId: string;
  tourTitle: string;
  startsAt: Date;
  durationMinutes: number;
  capacity: number;
  booked: number;
  status: string;
  meetingPoint: string | null;
  guests: { name: string; phone: string; people: number; status: string }[];
}

export interface CalendarRequest {
  id: string;
  kind: 'request';
  tourId: string;
  tourTitle: string;
  startsAt: Date;
  durationMinutes: number;
  people: number;
  status: string;
  contactName: string;
  contactPhone: string;
  meetingPoint: string | null;
}

export type CalendarEntry = CalendarSlot | CalendarRequest;

/**
 * Загрузка занятости за период.
 *
 * Две сущности дают события календаря: слоты расписания и заявки на свою
 * дату. Брони, привязанные к слоту, отдельными событиями не идут — иначе в
 * календаре двоилось бы; вместо этого они перечислены внутри слота.
 */
export async function loadRange(db: Db, from: Date, to: Date): Promise<CalendarEntry[]> {
  const slotRows = await db
    .select({
      id: schedules.id,
      tourId: schedules.tourId,
      startsAt: schedules.startsAt,
      capacity: schedules.capacity,
      booked: schedules.bookedCount,
      status: schedules.status,
      tourTitle: tours.title,
      durationMinutes: tours.durationMinutes,
      meetingPoint: tours.meetingPoint,
    })
    .from(schedules)
    .innerJoin(tours, eq(tours.id, schedules.tourId))
    .where(and(gte(schedules.startsAt, from), lte(schedules.startsAt, to)))
    .orderBy(asc(schedules.startsAt));

  const slotIds = slotRows.map((row) => row.id);

  const bookingRows = await db
    .select({
      id: bookings.id,
      tourId: bookings.tourId,
      scheduleId: bookings.scheduleId,
      desiredDate: bookings.desiredDate,
      people: bookings.peopleCount,
      status: bookings.status,
      contactName: bookings.contactName,
      contactPhone: bookings.contactPhone,
      tourTitle: tours.title,
      durationMinutes: tours.durationMinutes,
      meetingPoint: tours.meetingPoint,
    })
    .from(bookings)
    .innerJoin(tours, eq(tours.id, bookings.tourId))
    .where(
      and(
        // Отменённые в календаре только мешают.
        ne(bookings.status, 'cancelled'),
        slotIds.length > 0
          ? or(
              and(gte(bookings.desiredDate, from), lte(bookings.desiredDate, to)),
              // Брони на слоты периода нужны, чтобы подписать гостей внутри слота.
              inArray(bookings.scheduleId, slotIds),
            )
          : and(gte(bookings.desiredDate, from), lte(bookings.desiredDate, to)),
      ),
    );

  const guestsBySlot = new Map<string, CalendarSlot['guests']>();
  for (const row of bookingRows) {
    if (!row.scheduleId) continue;
    const list = guestsBySlot.get(row.scheduleId) ?? [];
    list.push({
      name: row.contactName,
      phone: row.contactPhone,
      people: row.people,
      status: row.status,
    });
    guestsBySlot.set(row.scheduleId, list);
  }

  const slots: CalendarEntry[] = slotRows.map((row) => ({
    kind: 'slot',
    id: row.id,
    tourId: row.tourId,
    tourTitle: row.tourTitle,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    capacity: row.capacity,
    booked: row.booked,
    status: row.status,
    meetingPoint: row.meetingPoint,
    guests: guestsBySlot.get(row.id) ?? [],
  }));

  const requests: CalendarEntry[] = bookingRows
    .filter(
      (row): row is typeof row & { desiredDate: Date } =>
        !row.scheduleId && row.desiredDate !== null && row.desiredDate >= from && row.desiredDate <= to,
    )
    .map((row) => ({
      kind: 'request',
      id: row.id,
      tourId: row.tourId,
      tourTitle: row.tourTitle,
      startsAt: row.desiredDate,
      durationMinutes: row.durationMinutes,
      people: row.people,
      status: row.status,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      meetingPoint: row.meetingPoint,
    }));

  return [...slots, ...requests].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/* ============================================================
   Лента iCalendar
   ============================================================ */

/** «2026-09-06T09:00:00Z» → «20260906T090000Z». */
function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** В тексте iCalendar служебные символы экранируются, перевод строки — как \n. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Складывание длинных строк.
 *
 * Стандарт требует не длиннее 75 октетов в строке, а продолжение начинать с
 * пробела. Считаем именно байты и не разрываем букву посередине: русский
 * текст в UTF-8 занимает по два байта на символ, и наивная резка по длине
 * строки ломала бы кодировку.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 74; // продолжение начинается с пробела
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

const STATUS_RU: Record<string, string> = {
  pending: 'ожидает подтверждения',
  confirmed: 'подтверждена',
  completed: 'завершена',
  open: 'открыт',
  closed: 'закрыт',
  cancelled: 'отменён',
};

function eventFor(entry: CalendarEntry, origin: string): string[] {
  const end = new Date(entry.startsAt.getTime() + entry.durationMinutes * 60_000);
  const lines: string[] = ['BEGIN:VEVENT'];

  lines.push(`UID:${entry.kind}-${entry.id}@tver-ryadom`);
  lines.push(`DTSTAMP:${stamp(new Date())}`);
  lines.push(`DTSTART:${stamp(entry.startsAt)}`);
  lines.push(`DTEND:${stamp(end)}`);

  if (entry.kind === 'slot') {
    lines.push(fold(`SUMMARY:${escapeText(`${entry.tourTitle} — ${entry.booked}/${entry.capacity}`)}`));
    const guests = entry.guests.length
      ? entry.guests
          .map((g) => `${g.name}, ${g.people} чел., ${g.phone} (${STATUS_RU[g.status] ?? g.status})`)
          .join('\n')
      : 'Записей пока нет';
    lines.push(fold(`DESCRIPTION:${escapeText(`Слот расписания (${STATUS_RU[entry.status] ?? entry.status})\n${guests}`)}`));
    lines.push(entry.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED');
  } else {
    lines.push(fold(`SUMMARY:${escapeText(`Заявка: ${entry.tourTitle} — ${entry.people} чел.`)}`));
    lines.push(
      fold(
        `DESCRIPTION:${escapeText(
          `${entry.contactName}, ${entry.contactPhone}\nСтатус: ${STATUS_RU[entry.status] ?? entry.status}`,
        )}`,
      ),
    );
    lines.push(entry.status === 'pending' ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED');
  }

  if (entry.meetingPoint) lines.push(fold(`LOCATION:${escapeText(entry.meetingPoint)}`));
  lines.push(fold(`URL:${origin}`));
  lines.push('END:VEVENT');
  return lines;
}

/** Готовая лента для Google Календаря, Apple, Outlook и прочих подписчиков. */
export function buildIcs(entries: CalendarEntry[], origin: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Тверь рядом//Календарь занятости//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Тверь рядом — экскурсии',
    'NAME:Тверь рядом — экскурсии',
    'X-WR-TIMEZONE:Europe/Moscow',
    // Подсказка подписчику, как часто перечитывать ленту.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...entries.flatMap((entry) => eventFor(entry, origin)),
    'END:VCALENDAR',
  ];
  // Стандарт требует именно CRLF.
  return lines.join('\r\n') + '\r\n';
}

/* ============================================================
   Секрет ленты
   ============================================================ */

export async function readFeedToken(db: Db): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, TOKEN_KEY) });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return row.value;
  }
}

async function writeFeedToken(db: Db, token: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key: TOKEN_KEY, value: JSON.stringify(token) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(token), updatedAt: new Date() },
    });
}

/** Адрес ленты знает только тот, кому его дали, — поэтому секрет длинный. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function ensureFeedToken(db: Db): Promise<string> {
  const existing = await readFeedToken(db);
  if (existing) return existing;
  const token = newToken();
  await writeFeedToken(db, token);
  return token;
}

export async function rotateFeedToken(db: Db): Promise<string> {
  const token = newToken();
  await writeFeedToken(db, token);
  return token;
}
