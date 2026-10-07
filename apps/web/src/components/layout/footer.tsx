import Link from 'next/link';
import { formatRuPhone } from '@tver/shared';
import { site } from '@/config/site';
import { Container } from '@/components/ui/container';
import type { SiteSettings } from '@/lib/types';

const linkCls =
  'link-underline text-muted hover:text-ink inline-block py-2 text-sm ' +
  'transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

/** Ссылки из настроек правит админ — режем `javascript:`/`data:` и мусор (M5). */
function safeHttpHref(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) return null;
  return trimmed;
}

function safeTelHref(phone: string | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!/^\+?[0-9\s\-()]+$/.test(trimmed)) return null;
  return `tel:${trimmed.replace(/\s+/g, '')}`;
}

function safeMailHref(email: string | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(trimmed)) return null;
  return `mailto:${trimmed}`;
}

export function Footer({ settings }: { settings: SiteSettings }) {
  const phone = settings['contacts.phone'];
  const email = settings['contacts.email'];
  const year = new Date().getFullYear();

  /* Текстовые ссылки вместо иконок-кружков: у МАКС нет общепринятого
     монохромного значка, а выдумывать чужой логотип неправильно.
     Заодно ряд подписей вразрядку точнее попадает в жанр. */
  const socials = [
    ['contacts.telegram', 'Telegram'],
    ['contacts.max', 'МАКС'],
    ['contacts.vk', 'ВКонтакте'],
  ] as const;

  return (
    <footer className="border-line border-t">
      <Container className="!max-w-[104rem]">
        <div className="grid gap-12 py-20 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="lg:pr-10">
            <p className="font-display text-ink text-[1.375rem] leading-none">
              Тверь <span className="italic">рядом</span>
            </p>
            <p className="text-muted mt-5 max-w-[32ch] text-sm leading-[1.7]">
              {settings['company.tagline'] ?? site.tagline}
            </p>
          </div>

          <nav aria-label="Разделы сайта">
            <p className="kicker-plain text-faint mb-5">Разделы</p>
            <ul className="space-y-0.5">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkCls}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="kicker-plain text-faint mb-5">Контакты</p>
            <ul className="space-y-0.5">
              {safeTelHref(phone) ? (
                <li>
                  <a href={safeTelHref(phone)!} className={linkCls}>
                    {formatRuPhone(phone!)}
                  </a>
                </li>
              ) : null}
              {safeMailHref(email) ? (
                <li>
                  <a href={safeMailHref(email)!} className={linkCls}>
                    {email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="kicker-plain text-faint mb-5">Мы на связи</p>
            <ul className="space-y-0.5">
              {socials.map(([key, label]) =>
                safeHttpHref(settings[key]) ? (
                  <li key={key}>
                    <a href={safeHttpHref(settings[key])!} target="_blank" rel="noopener noreferrer" className={linkCls}>
                      {label}
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        </div>

        <div className="border-line text-faint flex flex-col justify-between gap-3 border-t py-8 text-xs sm:flex-row">
          <p>
            © {year} {settings['company.name'] ?? site.name}. Экскурсии по Твери и окрестностям.
          </p>
          <p>Елена Громова — аттестованный экскурсовод</p>
        </div>
      </Container>
    </footer>
  );
}
