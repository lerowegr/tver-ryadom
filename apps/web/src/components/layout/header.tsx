'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { site } from '@/config/site';
import { Container } from '@/components/ui/container';
import { MenuIcon, XIcon } from '@/components/ui/icons';
import { useAuth } from '@/components/providers';
import { avatarUrl } from '@/lib/format';

const smooth = 'transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

function AccountLink({ className = '' }: { className?: string }) {
  const { user, status } = useAuth();

  if (status === 'authed' && user) {
    return (
      <Link
        href="/account"
        className={`text-ink hover:text-muted flex cursor-pointer items-center gap-2.5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase ${smooth} ${className}`}
      >
        <span className="border-line-strong block h-7 w-7 shrink-0 overflow-hidden border" aria-hidden>
          {avatarUrl(user.avatarKey) ? (
            <img src={avatarUrl(user.avatarKey)!} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[0.625rem]">
              {user.name[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </span>
        <span className="max-w-[9rem] truncate">{user.name}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/auth"
      className={`link-underline text-ink cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase ${className}`}
    >
      Войти
    </Link>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      /* Фон непрозрачный всегда: герой разрезан пополам — слева светлая
         колонка, справа фотография, — и прозрачная строка становится
         нечитаемой над одной из половин. Постоянная волосяная линия снизу
         заодно избавляет от слушателя скролла. */
      className="bg-bg border-line fixed inset-x-0 top-0 z-50 border-b"
    >
      <Container className="!max-w-[104rem]">
        <div className="flex h-20 items-center justify-between gap-8">
          {/* Логотип */}
          <Link href="/" className="group shrink-0" aria-label="На главную">
            <span className="font-display text-ink text-[1.375rem] leading-none tracking-[-0.01em]">
              Тверь <span className="italic">рядом</span>
            </span>
          </Link>

          {/* Навигация по центру — приём референса */}
          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 lg:flex"
            aria-label="Основная навигация"
          >
            {site.nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`link-underline cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase ${smooth} ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Правый край: вход + рамочная кнопка */}
          <div className="hidden items-center gap-8 lg:flex">
            <AccountLink />
            <Link
              href="/contacts"
              className={`border-line-strong text-ink hover:bg-ink hover:text-bg hover:border-ink cursor-pointer border px-7 py-3.5 text-[0.6875rem] font-medium tracking-[0.18em] uppercase ${smooth}`}
            >
              Связаться
            </Link>
          </div>

          <button
            className="text-ink -mr-2 cursor-pointer p-2 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          >
            {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* Раскрытие на CSS-сетке вместо AnimatePresence: ради одного этого
          меню в бандл тянулась вся анимационная библиотека. */}
      <div
        id="mobile-nav"
        className={`grid overflow-hidden transition-[grid-template-rows] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <nav className="border-line min-h-0 border-t" aria-label="Мобильная навигация">
          <Container className="flex flex-col gap-6 py-8">
            {site.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                tabIndex={open ? undefined : -1}
                className="text-ink cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase"
              >
                {item.label}
              </Link>
            ))}
            <AccountLink />
            <Link
              href="/contacts"
              tabIndex={open ? undefined : -1}
              className="border-line-strong text-ink mt-2 cursor-pointer border px-7 py-4 text-center text-[0.6875rem] font-medium tracking-[0.18em] uppercase"
            >
              Связаться
            </Link>
          </Container>
        </nav>
      </div>
    </header>
  );
}
