import type { FieldError } from '@todo/contracts';

export type ErrorCode =
  'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED';

/** Application failures carry meaning; HTTP status codes belong to the HTTP adapter. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (message: string, details?: FieldError[]) =>
  new AppError('VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError('UNAUTHORIZED', message);
export const notFound = (resource = 'Resource') =>
  new AppError('NOT_FOUND', `${resource} not found`);
export const conflict = (message: string) => new AppError('CONFLICT', message);
export const rateLimited = (message = 'Too many requests, please try again later') =>
  new AppError('RATE_LIMITED', message);
