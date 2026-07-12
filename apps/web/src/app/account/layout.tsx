'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/providers';
import { Container } from '@/components/ui/container';
import { authFetch } from '@/lib/auth';

const navItems = [
  { href: '/account', label: 'Профиль' },
  { href: '/account/bookings', label: 'Мои брони' },
  { href: '/account/favorites', label: 'Избранное' },
  { href: '/account/notifications', label: 'Уведомления' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const summary = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: () => authFetch<{ unread: number }>('/notifications?limit=1'),
    enabled: status === 'authed',
  });
  const unread = summary.data?.unread ?? 0;

  useEffect(() => {
    if (status === 'guest') {
      router.replace(`/auth?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== 'authed') {
    return (
      <div className="flex min-h-svh items-center justify-center pt-16" aria-busy="true">
        <p className="text-bark-600 animate-pulse">Загружаем личный кабинет…</p>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-16 md:pt-32">
      <Container>
        <h1 className="font-display text-ink-900 mb-8 text-3xl font-semibold md:text-4xl">
          Личный кабинет
        </h1>
        <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:items-start">
          <nav
            className="no-scrollbar flex gap-2 overflow-x-auto lg:sticky lg:top-24 lg:flex-col"
            aria-label="Разделы кабинета"
          >
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center justify-between gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition lg:rounded-2xl ${
                    active ? 'shadow-card text-ink-900 bg-white' : 'text-bark-700 hover:bg-white/60'
                  }`}
                >
                  {item.label}
                  {item.href === '/account/notifications' && unread > 0 ? (
                    <span className="bg-terra-500 rounded-full px-2 py-0.5 text-xs font-bold text-white">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <button
              onClick={() => logout().then(() => router.push('/'))}
              className="text-bark-600 hover:text-terra-600 shrink-0 rounded-full px-5 py-2.5 text-left text-sm font-semibold transition lg:rounded-2xl"
            >
              Выйти
            </button>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </Container>
    </div>
  );
}
