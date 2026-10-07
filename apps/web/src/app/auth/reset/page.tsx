import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetForm } from '@/components/auth/reset-form';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Новый пароль',
  description: 'Задайте новый пароль «Тверь рядом» по ссылке из письма.',
};

export default function ResetPage() {
  return (
    <div className="flex min-h-svh items-center pt-20 pb-16">
      <Container className="flex justify-center">
        <Suspense>
          <ResetForm />
        </Suspense>
      </Container>
    </div>
  );
}
