import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/auth-form';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Вход и регистрация',
  description: 'Войдите в личный кабинет «Тверь рядом», чтобы управлять бронированиями и избранным.',
};

export default function AuthPage() {
  return (
    <div className="flex min-h-svh items-center pt-20 pb-16">
      <Container className="flex justify-center">
        <Suspense>
          <AuthForm />
        </Suspense>
      </Container>
    </div>
  );
}
