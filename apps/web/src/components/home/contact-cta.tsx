import { formatRuPhone } from '@tver/shared';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { PhoneIcon, TelegramIcon, WhatsAppIcon } from '@/components/ui/icons';
import type { SiteSettings } from '@/lib/types';

export function ContactCta({ settings }: { settings: SiteSettings }) {
  const phone = settings['contacts.phone'];

  return (
    <section className="pb-20 md:pb-28">
      <Container>
        <Reveal>
          <div className="from-bark-700 to-bark-800 shadow-soft relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br px-8 py-14 md:px-16">
            <div className="bg-terra-500/25 absolute -top-20 right-0 h-72 w-72 rounded-full blur-3xl" aria-hidden />
            <div className="relative max-w-2xl">
              <h2 className="font-display text-3xl leading-tight font-semibold text-white text-balance md:text-4xl">
                Не нашли подходящую дату или собираете свою компанию?
              </h2>
              <p className="text-cream-200/90 mt-4 text-lg">
                Напишите нам — соберём экскурсию под вас: другое время, свой темп, особые интересы.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                {phone ? (
                  <Button href={`tel:${phone}`} size="lg">
                    <PhoneIcon className="h-5 w-5" /> {formatRuPhone(phone)}
                  </Button>
                ) : null}
                {settings['contacts.telegram'] ? (
                  <a
                    href={settings['contacts.telegram']}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3.5 font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <TelegramIcon className="h-5 w-5" /> Telegram
                  </a>
                ) : null}
                {settings['contacts.whatsapp'] ? (
                  <a
                    href={settings['contacts.whatsapp']}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3.5 font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <WhatsAppIcon className="h-5 w-5" /> WhatsApp
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
