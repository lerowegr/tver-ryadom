import Link from 'next/link';
import { formatRuPhone } from '@tver/shared';
import { site } from '@/config/site';
import { Container } from '@/components/ui/container';
import { MailIcon, PhoneIcon, TelegramIcon, VkIcon, WhatsAppIcon } from '@/components/ui/icons';
import type { SiteSettings } from '@/lib/types';

export function Footer({ settings }: { settings: SiteSettings }) {
  const phone = settings['contacts.phone'];
  const email = settings['contacts.email'];
  const year = new Date().getFullYear();

  return (
    <footer className="border-sand-200 bg-cream-100 mt-24 border-t">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-ink-900 text-xl font-semibold">
            Тверь <span className="text-terra-600 italic">рядом</span>
          </p>
          <p className="text-bark-700 mt-3 max-w-xs text-sm leading-relaxed">
            {settings['company.tagline'] ?? site.tagline}
          </p>
        </div>

        <nav aria-label="Разделы сайта">
          <p className="text-ink-900 mb-3 text-sm font-semibold tracking-wide uppercase">Разделы</p>
          <ul className="space-y-2">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-bark-700 hover:text-terra-600 text-sm">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-ink-900 mb-3 text-sm font-semibold tracking-wide uppercase">Контакты</p>
          <ul className="space-y-2 text-sm">
            {phone ? (
              <li>
                <a href={`tel:${phone}`} className="text-bark-700 hover:text-terra-600 flex items-center gap-2">
                  <PhoneIcon className="h-4 w-4" /> {formatRuPhone(phone)}
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`} className="text-bark-700 hover:text-terra-600 flex items-center gap-2">
                  <MailIcon className="h-4 w-4" /> {email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <p className="text-ink-900 mb-3 text-sm font-semibold tracking-wide uppercase">Мы на связи</p>
          <div className="flex gap-3">
            {settings['contacts.telegram'] ? (
              <a
                href={settings['contacts.telegram']}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="glass text-bark-700 hover:text-terra-600 rounded-full p-2.5 transition-colors"
              >
                <TelegramIcon className="h-5 w-5" />
              </a>
            ) : null}
            {settings['contacts.whatsapp'] ? (
              <a
                href={settings['contacts.whatsapp']}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="glass text-bark-700 hover:text-terra-600 rounded-full p-2.5 transition-colors"
              >
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            ) : null}
            {settings['contacts.vk'] ? (
              <a
                href={settings['contacts.vk']}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ВКонтакте"
                className="glass text-bark-700 hover:text-terra-600 rounded-full p-2.5 transition-colors"
              >
                <VkIcon className="h-5 w-5" />
              </a>
            ) : null}
          </div>
        </div>
      </Container>

      <div className="border-sand-200 border-t py-6">
        <Container className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
          <p className="text-bark-600">
            © {year} {settings['company.name'] ?? site.name}. Экскурсии по Твери и окрестностям.
          </p>
          <p className="text-bark-600">Сделано с любовью к городу</p>
        </Container>
      </div>
    </footer>
  );
}
