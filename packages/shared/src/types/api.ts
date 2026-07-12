/** Единый конверт ответов API. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Ошибки валидации по полям: { "contactPhone": "Некорректный номер телефона" } */
    details?: Record<string, string>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export const API_ERROR_CODES = [
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
