'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Turnstile не загрузился')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = '1';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Turnstile не загрузился')));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Капча Cloudflare Turnstile для гостевых форм (M6 UI).
 *
 * Без `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ничего не рисует и отдаёт пустой
 * токен — сервер в таком режиме проверку пропускает. Токен одноразовый:
 * после отправки формы виджет сбрасывается через `resetKey`.
 */
export function Turnstile({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  resetKey?: unknown;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const tokenRef = useRef<(token: string | null) => void>(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !boxRef.current || !window.turnstile || !SITE_KEY) return;
        widgetRef.current = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          callback: (token) => tokenRef.current(token),
          'expired-callback': () => tokenRef.current(null),
          'error-callback': () => tokenRef.current(null),
        });
      })
      .catch(() => tokenRef.current(null));
    return () => {
      alive = false;
      if (widgetRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch {
          /* уже удалён */
        }
        widgetRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetKey === undefined) return;
    if (widgetRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetRef.current);
      } catch {
        /* виджет ещё не готов */
      }
    }
    tokenRef.current(null);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={boxRef} className="mt-2 min-h-[65px]" aria-label="Проверка, что вы не робот" />;
}
