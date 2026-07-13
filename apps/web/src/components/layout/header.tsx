'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { site } from '@/config/site';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { MenuIcon, XIcon } from '@/components/ui/icons';
import { useAuth } from '@/components/providers';

function AccountLink({ className = '' }: { className?: string }) {
  const { user, status } = useAuth();

  if (status === 'authed' && user) {
    return (
      <Link
        href="/account"
        className={`text-bark-800 flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold transition hover:bg-white/70 ${className}`}
      >
        <span
          className="from-sand-400 to-terra-500 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white"
          aria-hidden
        >
          {user.name[0]?.toUpperCase() ?? '?'}
        </span>
        <span className="max-w-28 truncate">{user.name}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/auth"
      className={`border-bark-600/30 text-bark-800 hover:border-terra-500 hover:text-terra-600 inline-flex items-center rounded-full border bg-white/70 px-5 py-2 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white ${className}`}
    >
      Войти
    </Link>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open ? 'glass shadow-soft' : 'bg-transparent'
      }`}
    >
      <Container>
        <div className="flex h-16 items-center justify-between md:h-[4.5rem]">
          <Link href="/" className="group flex items-baseline gap-1" aria-label="На главную">
            <span className="font-display text-ink-900 text-2xl font-semibold">Тверь</span>
            <span className="text-terra-600 font-display text-2xl italic transition-transform duration-300 group-hover:translate-x-0.5">
              рядом
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">
            {site.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-bark-600/10 text-ink-900'
                    : 'text-bark-700 hover:text-ink-900'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <AccountLink className="ml-1" />
            <Button href="/excursions" className="ml-2">
              Забронировать
            </Button>
          </nav>

          <button
            className="text-bark-800 -mr-2 rounded-full p-2 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          >
            {open ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open ? (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden md:hidden"
            aria-label="Мобильная навигация"
          >
            <Container className="flex flex-col gap-1 pb-5">
              {site.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-bark-800 rounded-xl px-3 py-3 text-base font-medium hover:bg-white/60"
                >
                  {item.label}
                </Link>
              ))}
              <AccountLink className="px-3 py-3" />
              <Button href="/excursions" className="mt-2">
                Забронировать экскурсию
              </Button>
            </Container>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
