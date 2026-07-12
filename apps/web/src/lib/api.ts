import type { ApiErrorCode, ApiResponse } from '@tver/shared';

function apiBase(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8787';
  }
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8787';
}

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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}/api/v1${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

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

export function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body), ...init });
}
