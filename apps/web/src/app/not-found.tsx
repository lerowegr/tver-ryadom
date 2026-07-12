import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center pt-16">
      <Container className="text-center">
        <p className="font-display text-terra-500 text-8xl font-semibold">404</p>
        <h1 className="font-display text-ink-900 mt-4 text-3xl font-semibold">
          Кажется, вы свернули не туда
        </h1>
        <p className="text-bark-700 mx-auto mt-3 max-w-md">
          Такой страницы нет — зато есть целая Тверь, которую мы с удовольствием покажем.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button href="/">На главную</Button>
          <Button href="/excursions" variant="secondary">
            К экскурсиям
          </Button>
        </div>
      </Container>
    </div>
  );
}
