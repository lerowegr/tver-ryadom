'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useAdminAuth } from '@/components/providers';
import { authFetch } from '@/lib/api';
import type { AdminStats } from '@/lib/types';

const nav = [
  { href: '/', label: 'Дашборд' },
  { href: '/tours', label: 'Экскурсии' },
  { href: '/bookings', label: 'Бронирования' },
  { href: '/calendar', label: 'Календарь' },
  { href: '/reviews', label: 'Отзывы' },
  { href: '/users', label: 'Пользователи' },
  { href: '/requests', label: 'Заявки' },
  { href: '/outbox', label: 'Уведомления' },
  { href: '/settings', label: 'Настройки' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, status, logout } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => authFetch<AdminStats>('/admin/stats'),
    enabled: status === 'authed',
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed') {
    return (
      <div className="flex min-h-svh items-center justify-center" aria-busy="true">
        <p className="kicker-plain text-muted animate-pulse">Проверяем доступ…</p>
      </div>
    );
  }

  const badges: Record<string, number | undefined> = {
    '/bookings': stats.data?.pendingBookings,
    '/reviews': stats.data?.pendingReviews,
    '/requests': stats.data?.newRequests,
    '/outbox': stats.data?.failedNotifications,
  };

  return (
    <div className="flex min-h-svh">
      <aside className="border-line bg-surface-soft hidden w-64 shrink-0 flex-col border-r px-6 py-8 md:flex">
        <p className="mb-10">
          <span className="font-display text-ink text-xl leading-none">
            Тверь <span className="italic">рядом</span>
          </span>
          <span className="kicker-plain mt-2.5 block">панель управления</span>
        </p>
        <nav className="border-line flex flex-1 flex-col border-t" aria-label="Разделы админки">
          {nav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const badge = badges[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`border-line flex items-center justify-between border-b py-3.5 text-[0.625rem] font-medium tracking-[0.16em] uppercase transition-colors duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {item.label}
                {badge ? (
                  <span
                    className={`px-1.5 py-0.5 text-[0.625rem] tabular-nums ${
                      item.href === '/outbox' ? 'bg-danger text-white' : 'bg-ink text-bg'
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8">
          <p className="text-ink truncate text-sm">{user?.name}</p>
          <button
            onClick={() => logout().then(() => router.replace('/login'))}
            className="text-muted hover:text-ink mt-2 cursor-pointer text-[0.625rem] font-medium tracking-[0.16em] uppercase transition-colors duration-400"
          >
            Выйти
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="border-line bg-surface-soft flex items-center gap-6 overflow-x-auto border-b px-5 py-4 md:hidden">
          {nav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 text-[0.625rem] font-medium tracking-[0.16em] uppercase ${
                  active ? 'text-ink' : 'text-muted'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <main className="p-5 md:p-10">{children}</main>
      </div>
    </div>
  );
}
