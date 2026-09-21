import Link from 'next/link';
import { formatRuPhone } from '@tver/shared';
import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import type { SiteSettings } from '@/lib/types';

/**
 * Финальный блок. Тёмная полоса на почти-чёрном — единственная инверсия
 * на странице: она закрывает ритм и отделяет подвал.
 */
export function ContactCta({ settings }: { settings: SiteSettings }) {
  const phone = settings['contacts.phone'];
  const telegram = settings['contacts.telegram'];
  const max = settings['contacts.max'];
  const vk = settings['contacts.vk'];

  const linkCls =
    'link-underline text-bg/80 hover:text-bg text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500';

  return (
    <section className="bg-ink text-bg py-28 md:py-40">
      <Container className="!max-w-[104rem]">
        <Reveal>
          <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-24">
            <div>
              <p className="kicker-plain text-bg/45 mb-6">Сборные группы</p>
              <h2 className="font-display text-[clamp(1.875rem,3.4vw,3rem)] leading-[1.08] text-balance">
                Ищете вариант экскурсии в составе сборной группы?
              </h2>
            </div>

            <div className="flex flex-col justify-end">
              <p className="text-bg/65 max-w-[42ch] text-[1.0625rem] leading-[1.75]">
                Посмотрите раздел «Расписание» или группу ВКонтакте — каждый месяц там выходит
                расписание сборных экскурсий.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-5">
                <Link
                  href="/schedule"
                  className="bg-bg text-ink cursor-pointer px-10 py-5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white"
                >
                  Расписание
                </Link>
                <Link href="/contacts" className={linkCls}>
                  Написать
                </Link>
                {phone ? (
                  <a href={`tel:${phone}`} className={linkCls}>
                    {formatRuPhone(phone)}
                  </a>
                ) : null}
                {telegram ? (
                  <a href={telegram} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    Telegram
                  </a>
                ) : null}
                {max ? (
                  <a href={max} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    МАКС
                  </a>
                ) : null}
                {vk ? (
                  <a href={vk} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    ВКонтакте
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
