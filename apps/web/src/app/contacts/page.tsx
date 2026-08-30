import type { Metadata } from 'next';
import { formatRuPhone } from '@tver/shared';
import { ContactForm } from '@/components/forms/contact-form';
import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import { getSettings } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Контакты',
  description:
    'Связаться с Еленой Громовой: телефон, почта, Telegram, WhatsApp, ВКонтакте и MAX. Помогу подобрать экскурсию по Твери и собрать маршрут под вашу компанию.',
};

interface Channel {
  label: string;
  value: string;
  href: string;
  note: string;
}

export default async function ContactsPage() {
  const settings = await getSettings();
  const phone = settings['contacts.phone'];
  const email = settings['contacts.email'];

  /* Каналы списком, без иконок-плашек: у MAX нет общепринятого
     монохромного значка, а рисовать чужой логотип наугад неправильно. */
  const channels: Channel[] = [
    phone
      ? { label: 'Телефон', value: formatRuPhone(phone), href: `tel:${phone}`, note: 'Ежедневно с 9:00 до 21:00' }
      : null,
    email ? { label: 'Почта', value: email, href: `mailto:${email}`, note: 'Отвечаю в течение дня' } : null,
    settings['contacts.telegram']
      ? {
          label: 'Telegram',
          value: 'Написать в Telegram',
          href: settings['contacts.telegram'],
          note: 'Самый быстрый способ',
        }
      : null,
    settings['contacts.whatsapp']
      ? {
          label: 'WhatsApp',
          value: 'Написать в WhatsApp',
          href: settings['contacts.whatsapp'],
          note: 'Голосом или текстом',
        }
      : null,
    settings['contacts.vk']
      ? { label: 'ВКонтакте', value: 'Страница ВКонтакте', href: settings['contacts.vk'], note: 'Анонсы и фотоотчёты' }
      : null,
    settings['contacts.max']
      ? { label: 'MAX', value: 'Написать в MAX', href: settings['contacts.max'], note: 'Российский мессенджер' }
      : null,
  ].filter((c): c is Channel => c !== null);

  return (
    <div className="pt-40 pb-28 md:pt-52 md:pb-40">
      <Container className="!max-w-[104rem]">
        <Reveal className="max-w-2xl">
          <p className="kicker mb-7">Контакты</p>
          <h1 className="display text-[clamp(2.5rem,5vw,4.25rem)]">Как со мной связаться</h1>
          <p className="text-muted mt-7 text-[1.0625rem] leading-[1.75]">
            Выберите удобный способ — помогу подобрать экскурсию, отвечу на вопросы и соберу
            маршрут под вашу компанию.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-x-10 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3">
          {channels.map((channel, i) => (
            <Reveal key={channel.label} delay={i * 0.07}>
              <a
                href={channel.href}
                target={channel.href.startsWith('http') ? '_blank' : undefined}
                rel={channel.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="group border-line hover:border-ink block border-t py-8 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              >
                <p className="kicker-plain text-faint">{channel.label}</p>
                <p className="font-display text-ink mt-4 text-[1.375rem] leading-tight">{channel.value}</p>
                <p className="text-muted mt-3 text-sm">{channel.note}</p>
              </a>
            </Reveal>
          ))}

          <Reveal delay={channels.length * 0.07}>
            <div className="border-line border-t py-8">
              <p className="kicker-plain text-faint">Где встречаемся</p>
              <p className="font-display text-ink mt-4 text-[1.375rem] leading-tight">Тверь, центр города</p>
              <p className="text-muted mt-3 text-sm leading-relaxed">
                Обычно — у Императорского путевого дворца. Точное место приходит после бронирования.
              </p>
              <a
                href="https://www.openstreetmap.org/?mlat=56.8626&mlon=35.8988#map=17/56.8626/35.8988"
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline text-muted mt-4 inline-block text-sm"
              >
                Открыть на карте
              </a>
            </div>
          </Reveal>
        </div>

        <div className="mt-28 md:mt-40">
          <Reveal>
            <div className="mx-auto max-w-2xl">
              <p className="kicker mb-7">Форма</p>
              <h2 className="display text-[clamp(1.75rem,3vw,2.5rem)]">Написать напрямую</h2>
              <p className="text-muted mt-6 mb-12 text-[1.0625rem] leading-[1.75]">
                Оставьте сообщение — вернусь с ответом на телефон или почту. Это ни к чему не обязывает.
              </p>
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </Container>
    </div>
  );
}
