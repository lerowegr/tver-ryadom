import type { Metadata } from 'next';
import { formatRuPhone } from '@tver/shared';
import { ContactForm } from '@/components/forms/contact-form';
import { Reveal } from '@/components/motion/reveal';
import { Container } from '@/components/ui/container';
import {
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  TelegramIcon,
  VkIcon,
  WhatsAppIcon,
} from '@/components/ui/icons';
import { getSettings } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Контакты',
  description:
    'Свяжитесь с «Тверь рядом»: телефон, email, Telegram, WhatsApp и ВКонтакте. Ответим на вопросы и поможем выбрать экскурсию по Твери.',
};

export default async function ContactsPage() {
  const settings = await getSettings();
  const phone = settings['contacts.phone'];
  const email = settings['contacts.email'];

  const channels = [
    phone
      ? {
          icon: PhoneIcon,
          label: 'Телефон',
          value: formatRuPhone(phone),
          href: `tel:${phone}`,
          note: 'Ежедневно с 9:00 до 21:00',
        }
      : null,
    email
      ? {
          icon: MailIcon,
          label: 'Email',
          value: email,
          href: `mailto:${email}`,
          note: 'Отвечаем в течение дня',
        }
      : null,
    settings['contacts.telegram']
      ? {
          icon: TelegramIcon,
          label: 'Telegram',
          value: 'Написать в Telegram',
          href: settings['contacts.telegram'],
          note: 'Самый быстрый способ',
        }
      : null,
    settings['contacts.whatsapp']
      ? {
          icon: WhatsAppIcon,
          label: 'WhatsApp',
          value: 'Написать в WhatsApp',
          href: settings['contacts.whatsapp'],
          note: 'Голосом или текстом',
        }
      : null,
    settings['contacts.vk']
      ? {
          icon: VkIcon,
          label: 'ВКонтакте',
          value: 'Наша группа VK',
          href: settings['contacts.vk'],
          note: 'Анонсы и фотоотчёты',
        }
      : null,
  ].filter((c) => c !== null);

  return (
    <div className="pt-28 pb-10 md:pt-36">
      <Container>
        <Reveal className="max-w-2xl">
          <p className="text-terra-600 mb-3 text-sm font-semibold tracking-widest uppercase">Контакты</p>
          <h1 className="font-display text-ink-900 text-4xl leading-tight font-semibold md:text-5xl">
            Мы всегда рядом
          </h1>
          <p className="text-bark-700 mt-4 text-lg">
            Выбирайте удобный способ связи — поможем подобрать экскурсию, ответим на вопросы,
            соберём маршрут под вашу компанию.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel, i) => (
            <Reveal key={channel.label} delay={i * 0.06}>
              <a
                href={channel.href}
                target={channel.href.startsWith('http') ? '_blank' : undefined}
                rel={channel.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="glass shadow-card hover:shadow-soft group block h-full rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="bg-terra-500/10 text-terra-600 mb-4 inline-flex rounded-2xl p-3">
                  <channel.icon className="h-6 w-6" />
                </div>
                <p className="text-bark-600 text-xs font-semibold tracking-wide uppercase">{channel.label}</p>
                <p className="text-ink-900 group-hover:text-terra-600 mt-1 font-bold transition-colors">
                  {channel.value}
                </p>
                <p className="text-bark-600 mt-1 text-sm">{channel.note}</p>
              </a>
            </Reveal>
          ))}

          <Reveal delay={0.3}>
            <div className="glass shadow-card h-full rounded-3xl p-7">
              <div className="bg-terra-500/10 text-terra-600 mb-4 inline-flex rounded-2xl p-3">
                <MapPinIcon className="h-6 w-6" />
              </div>
              <p className="text-bark-600 text-xs font-semibold tracking-wide uppercase">Где мы встречаемся</p>
              <p className="text-ink-900 mt-1 font-bold">Тверь, центр города</p>
              <p className="text-bark-600 mt-1 text-sm">
                Обычно — у Императорского путевого дворца. Точное место приходит после бронирования.
              </p>
              <a
                href="https://yandex.ru/maps/?pt=35.8988,56.8626&z=16"
                target="_blank"
                rel="noopener noreferrer"
                className="text-terra-600 mt-2 inline-block text-sm font-semibold hover:underline"
              >
                Открыть карту →
              </a>
            </div>
          </Reveal>
        </div>

        <div className="mt-16">
          <Reveal>
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-ink-900 heading-accent text-2xl font-semibold md:text-3xl">
                Форма обратной связи
              </h2>
              <p className="text-bark-700 mt-5 mb-8">
                Напишите нам — вернёмся с ответом на телефон или почту. Это ни к чему не обязывает.
              </p>
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </Container>
    </div>
  );
}
