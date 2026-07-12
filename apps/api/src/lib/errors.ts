import type { ApiErrorCode } from '@tver/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, 401 | 403 | 404 | 409 | 422 | 429 | 500> = {
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status() {
    return STATUS_BY_CODE[this.code];
  }
}

export const notFound = (message = 'Не найдено') => new AppError('not_found', message);
export const unauthorized = (message = 'Требуется авторизация') =>
  new AppError('unauthorized', message);
export const forbidden = (message = 'Недостаточно прав') => new AppError('forbidden', message);
export const conflict = (message: string) => new AppError('conflict', message);
export const validationError = (message: string, details?: Record<string, string>) =>
  new AppError('validation_error', message, details);
