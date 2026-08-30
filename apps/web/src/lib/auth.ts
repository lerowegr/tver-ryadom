'use client';

import type { ApiResponse } from '@tver/shared';
import { ApiRequestError } from './api';
import type { PublicUserDto } from './types';

/**
 * Клиентская сессия: access-токен (15 мин) живёт в памяти вкладки,
 * refresh-токен — в httpOnly-куке API. При 401 запрос прозрачно
 * повторяется после обновления токена.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
}

export interface SessionData {
  user: PublicUserDto;
  accessToken: string;
}

async function parse<T>(res: Response): Promise<T> {
  let payload: ApiResponse<T>;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError('internal_error', `API вернул некорректный ответ (${res.status})`);
  }
  if (!payload.success) {
    throw new ApiRequestError(payload.error.code, payload.error.message, payload.error.details);
  }
  return payload.data;
}

/** Пытается поднять сессию по refresh-куке; null — гость. */
export async function tryRefreshSession(): Promise<SessionData | null> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await parse<SessionData>(res);
    accessToken = data.accessToken;
    return data;
  } catch {
    return null;
  }
}

/** Запрос к API с Bearer-токеном и одним повтором после обновления сессии. */
export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = () =>
    fetch(`${apiBase()}/api/v1${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        // Для FormData заголовок ставит браузер — ему нужно вписать границу
        // частей multipart, и наш JSON-тип сломал бы разбор на сервере.
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init?.headers,
      },
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await tryRefreshSession();
    if (refreshed) res = await doFetch();
  }
  return parse<T>(res);
}

export async function loginRequest(email: string, password: string): Promise<SessionData> {
  const res = await fetch(`${apiBase()}/api/v1/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parse<SessionData>(res);
  accessToken = data.accessToken;
  return data;
}

export async function registerRequest(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<SessionData> {
  const res = await fetch(`${apiBase()}/api/v1/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parse<SessionData>(res);
  accessToken = data.accessToken;
  return data;
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
  } finally {
    accessToken = null;
  }
}

/**
 * Вход из мини-приложения Telegram.
 *
 * Пароля здесь нет: личность подтверждает сам Telegram подписью в initData,
 * а проверяет её сервер. Отдельная функция, а не ветка в loginRequest —
 * у них разные входные данные и разный смысл.
 */
export async function loginByTelegram(initData: string): Promise<SessionData> {
  const res = await fetch(`${apiBase()}/api/v1/auth/telegram-webapp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  const data = await parse<SessionData>(res);
  accessToken = data.accessToken;
  return data;
}
