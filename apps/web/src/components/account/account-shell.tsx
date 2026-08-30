'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/providers';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Container } from '@/components/ui/container';
import { authFetch } from '@/lib/auth';

const navItems = [
  { href: '/account', label: 'Профиль' },
  { href: '/account/bookings', label: 'Мои брони' },
  { href: '/account/favorites', label: 'Избранное' },
  { href: '/account/notifications', label: 'Уведомления' },
];

/**
 * Оболочка личного кабинета: боковые разделы, счётчик уведомлений и охрана
 * входа. Живёт отдельным клиентским компонентом, чтобы сам layout остался
 * серверным и мог объявить заголовок вкладки.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const { status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Выход подтверждаем: промахнуться по нему легко, а вернуться —
  // только через повторный ввод пароля.
  const [askLogout, setAskLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
        <p className="kicker-plain text-muted animate-pulse">Загружаем личный кабинет…</p>
      </div>
    );
  }

  return (
    <div className="pt-40 pb-28 md:pt-52">
      <Container className="!max-w-[104rem]">
        <p className="kicker mb-7">Кабинет</p>
        <h1 className="display mb-16 text-[clamp(2.25rem,4.4vw,3.5rem)]">Личный кабинет</h1>
        <div className="grid gap-12 lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-20">
          <nav
            className="no-scrollbar border-line flex gap-8 overflow-x-auto lg:sticky lg:top-28 lg:flex-col lg:gap-0 lg:border-t"
            aria-label="Разделы кабинета"
          >
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center justify-between gap-3 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:border-line lg:border-b ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                  {item.href === '/account/notifications' && unread > 0 ? (
                    <span className="bg-ink text-bg px-2 py-0.5 text-[0.625rem] tabular-nums">{unread}</span>
                  ) : null}
                </Link>
              );
            })}
            <button
              onClick={() => setAskLogout(true)}
              className="text-muted hover:text-danger shrink-0 cursor-pointer py-4 text-left text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500"
            >
              Выйти
            </button>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </Container>

      <ConfirmDialog
        open={askLogout}
        tone="danger"
        title="Выйти из аккаунта?"
        text="Брони и избранное останутся на месте — чтобы вернуться к ним, нужно будет войти снова."
        confirmLabel="Выйти"
        cancelLabel="Остаться"
        busy={leaving}
        onCancel={() => setAskLogout(false)}
        onConfirm={async () => {
          setLeaving(true);
          try {
            await logout();
            router.push('/');
          } finally {
            setLeaving(false);
            setAskLogout(false);
          }
        }}
      />
    </div>
  );
}
