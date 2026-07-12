'use client';

import type { ApiErrorCode, ApiResponse } from '@tver/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

let accessToken: string | null = null;

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
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

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: 'user' | 'admin';
}

export interface SessionData {
  user: AdminUser;
  accessToken: string;
}

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

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
  } finally {
    accessToken = null;
  }
}

/** Запрос к API с Bearer-токеном и повтором после обновления сессии. */
export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const doFetch = () =>
    fetch(`${apiBase()}/api/v1${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
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
