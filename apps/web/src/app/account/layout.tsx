import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountShell } from '@/components/account/account-shell';

// Раздел закрыт входом, но вкладка браузера всё равно должна называться
// по делу — раньше здесь стоял общий заголовок сайта.
export const metadata: Metadata = {
  title: 'Личный кабинет',
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
