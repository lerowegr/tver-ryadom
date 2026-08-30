'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/providers';
import { loginByTelegram } from '@/lib/auth';

/**
 * Мост между сайтом и мини-приложением Telegram.
 *
 * Сайт остаётся тем же самым: внутри Telegram он открывается на весь экран,
 * а вход происходит без пароля — личность подтверждает подпись, которую
 * Telegram кладёт в initData. Переписывать интерфейс под мессенджер не
 * потребовалось, и это главный смысл затеи.
 *
 * За пределами Telegram компонент не делает ничего: объекта WebApp там нет.
 */

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: 'light' | 'dark';
  themeParams?: { bg_color?: string };
  setHeaderColor?: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function TelegramWebApp() {
  const { status, setUser } = useAuth();
  // Попытка входа ровно одна: повтор при каждом рендере ничего не улучшит,
  // а сессий наплодит.
  const tried = useRef(false);

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (!app) return;

    app.ready();
    app.expand();
    // Шапка под цвет страницы, иначе она остаётся телеграмовской.
    app.setHeaderColor?.(app.themeParams?.bg_color ?? '#fdfcfa');
    document.documentElement.dataset.telegram = 'true';

    if (tried.current || status === 'loading' || status === 'authed') return;
    if (!app.initData) return;
    tried.current = true;

    loginByTelegram(app.initData)
      .then((session) => setUser(session.user))
      .catch(() => {
        // Подпись не подошла или бот отключён — остаёмся гостем. Сайт
        // работает и так, просто без личного кабинета.
      });
  }, [status, setUser]);

  return null;
}
