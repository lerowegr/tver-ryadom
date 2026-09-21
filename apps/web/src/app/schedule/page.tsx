import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import { getSchedule, getSettings, safe } from '@/lib/data';
import { formatDuration, priceLabel } from '@/lib/format';
import type { ScheduleEntryDto } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Расписание сборных экскурсий по Твери',
  description:
    'Ближайшие сборные экскурсии по Твери и окрестностям: даты, время, свободные места и запись онлайн. Расписание обновляется каждый месяц.',
};

/**
 * Страница собирается на сервере, а он живёт в UTC: без явного пояса
 * одиннадцать утра в Твери превратились бы в восемь. Поэтому каждый
 * формат здесь прибит к московскому времени, и разбивка по месяцам тоже.
 */
const MSK = 'Europe/Moscow';

const monthTitle = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: MSK,
});
const dayTitle = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  timeZone: MSK,
});
const clock = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: MSK,
});
/** en-CA даёт ГГГГ-ММ-ДД — из него и берётся ключ месяца. */
const isoDay = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: MSK,
});

/** Русская локаль дописывает «2026 г.» — в заголовке это канцелярит. */
function human(formatter: Intl.DateTimeFormat, value: Date): string {
  return formatter.format(value).replace(/\s*г\.$/, '');
}

/** Ключ месяца для группировки: сортируется как строка и не зависит от локали. */
function monthKey(value: Date): string {
  return isoDay.format(value).slice(0, 7);
}

function groupByMonth(items: ScheduleEntryDto[]) {
  const months = new Map<string, { title: string; items: ScheduleEntryDto[] }>();
  for (const item of items) {
    const date = new Date(item.startsAt);
    const key = monthKey(date);
    const bucket = months.get(key) ?? { title: human(monthTitle, date), items: [] };
    bucket.items.push(item);
    months.set(key, bucket);
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}

export default async function SchedulePage() {
  const [schedule, settings] = await Promise.all([
    safe(getSchedule(), { items: [] }),
    getSettings(),
  ]);
  const months = groupByMonth(schedule.items);
  const vk = settings['contacts.vk'];
  const intro = settings['schedule.intro'];

  return (
    <div className="pt-40 pb-28 md:pt-52 md:pb-40">
      <Container className="!max-w-[104rem]">
        <Reveal className="max-w-2xl">
          <p className="kicker mb-7">Расписание</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.25rem)]">Сборные экскурсии</h1>
          <p className="text-muted mt-7 text-[1.0625rem] leading-[1.75]">
            {intro ??
              'Здесь публикуются даты экскурсий в составе сборной группы. Выберите день — и записывайтесь прямо со страницы маршрута.'}
          </p>
        </Reveal>

        {months.length > 0 ? (
          <div className="mt-16 space-y-20 md:mt-24">
            {months.map((month) => (
              <section key={month.title} aria-label={month.title}>
                <h2 className="display mb-8 text-[clamp(1.5rem,2.4vw,2.125rem)] first-letter:uppercase">
                  {month.title}
                </h2>
                <ul className="border-line border-t">
                  {month.items.map((entry) => {
                    const starts = new Date(entry.startsAt);
                    const soldOut = entry.freeSeats === 0;
                    return (
                      <li
                        key={entry.id}
                        className="border-line grid gap-4 border-b py-7 sm:grid-cols-[11rem_1fr_auto] sm:items-baseline sm:gap-8"
                      >
                        <div>
                          <p className="text-ink text-sm first-letter:uppercase">
                            {human(dayTitle, starts)}
                          </p>
                          <p className="text-muted mt-1 text-sm tabular-nums">{clock.format(starts)}</p>
                        </div>

                        <div className="min-w-0">
                          <Link
                            href={`/excursions/${entry.tour.slug}`}
                            className="link-underline font-display text-ink text-[1.25rem] leading-tight"
                          >
                            {entry.tour.title}
                          </Link>
                          <p className="text-muted mt-2 text-sm">
                            {priceLabel(entry.tour.price, entry.tour.priceType)} ·{' '}
                            {formatDuration(entry.tour.durationMinutes)} ·{' '}
                            {soldOut ? 'мест нет' : `свободно ${entry.freeSeats}`}
                          </p>
                        </div>

                        {soldOut ? (
                          <span className="text-faint text-[0.6875rem] font-medium tracking-[0.18em] uppercase">
                            Группа набрана
                          </span>
                        ) : (
                          <Link
                            href={`/excursions/${entry.tour.slug}#booking`}
                            className="bg-ink text-bg hover:bg-ink-soft inline-flex items-center justify-center px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                          >
                            Записаться
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          /* Пустой список — обычное дело между наборами групп, и молчать
             в такой момент хуже всего: человеку нужно, куда пойти дальше. */
          <div className="border-line mt-16 max-w-2xl border-t pt-10 md:mt-24">
            <p className="font-display text-ink text-[1.375rem] leading-tight">
              Ближайших сборных дат пока нет
            </p>
            <p className="text-muted mt-4 text-[1.0625rem] leading-[1.75]">
              Новое расписание появляется каждый месяц — здесь и в группе ВКонтакте. А индивидуальную
              экскурсию можно заказать на любой день: выберите маршрут и удобное время.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                href="/excursions"
                className="bg-ink text-bg hover:bg-ink-soft inline-flex items-center px-10 py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              >
                Выбрать экскурсию
              </Link>
              {vk ? (
                <a
                  href={vk}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline text-muted hover:text-ink text-sm"
                >
                  Группа ВКонтакте
                </a>
              ) : null}
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
