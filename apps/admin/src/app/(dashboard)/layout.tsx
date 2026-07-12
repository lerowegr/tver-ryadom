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
  { href: '/reviews', label: 'Отзывы' },
  { href: '/users', label: 'Пользователи' },
  { href: '/requests', label: 'Заявки' },
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
        <p className="text-bark-600 animate-pulse">Проверяем доступ…</p>
      </div>
    );
  }

  const badges: Record<string, number | undefined> = {
    '/bookings': stats.data?.pendingBookings,
    '/reviews': stats.data?.pendingReviews,
    '/requests': stats.data?.newRequests,
  };

  return (
    <div className="flex min-h-svh">
      <aside className="border-cream-200 bg-cream-100 hidden w-60 shrink-0 flex-col border-r p-5 md:flex">
        <p className="text-ink-900 mb-8 text-lg font-bold">
          Тверь <span className="text-terra-600 italic">рядом</span>
          <span className="text-bark-500 mt-0.5 block text-xs font-medium">панель управления</span>
        </p>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Разделы админки">
          {nav.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const badge = badges[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  active ? 'shadow-card text-ink-900 bg-white' : 'text-bark-700 hover:bg-white/60'
                }`}
              >
                {item.label}
                {badge ? (
                  <span className="bg-terra-500 rounded-full px-2 py-0.5 text-xs font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-cream-200 mt-6 border-t pt-4">
          <p className="text-ink-900 truncate text-sm font-semibold">{user?.name}</p>
          <button
            onClick={() => logout().then(() => router.replace('/login'))}
            className="text-bark-600 hover:text-terra-600 mt-1 text-sm font-medium"
          >
            Выйти
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="border-cream-200 bg-cream-100 flex items-center gap-3 overflow-x-auto border-b p-3 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-bark-700 shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
