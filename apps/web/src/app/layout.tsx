import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { Providers } from '@/components/providers';
import { site } from '@/config/site';
import { getSettings } from '@/lib/data';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — экскурсии по Твери`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: site.name,
    title: `${site.name} — экскурсии по Твери`,
    description: site.description,
  },
};

export const viewport: Viewport = {
  themeColor: '#fdfcfa',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();

  // suppressHydrationWarning: инлайн-скрипт ниже дописывает класс js-motion
  // до гидратации, и React иначе жалуется на расхождение разметки сервера
  // и клиента именно по этому атрибуту.
  return (
    <html lang="ru" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <head>
        {/* Выполняется до первой отрисовки. Прячем анимируемые элементы
            только если JS жив — иначе контент виден без анимации. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js-motion')",
          }}
        />
      </head>
      <body>
        <Providers>
          <Header />
          <main id="main">{children}</main>
          <Footer settings={settings} />
        </Providers>
      </body>
    </html>
  );
}
