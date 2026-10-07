import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotForm } from '@/components/auth/forgot-form';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Восстановление пароля',
  description: 'Пришлём ссылку для нового пароля «Тверь рядом» на email от аккаунта.',
};

export default function ForgotPage() {
  return (
    <div className="flex min-h-svh items-center pt-20 pb-16">
      <Container className="flex justify-center">
        <Suspense>
          <ForgotForm />
        </Suspense>
      </Container>
    </div>
  );
}
