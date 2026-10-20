import type { ErrorResponse } from '@todo/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../logger.js';
import { AppError, notFound, type ErrorCode } from '../errors.js';

const statusFor: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

interface ClientError {
  status: number;
  message: string;
  expose?: boolean;
}

const isClientError = (error: unknown): error is ClientError =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof error.status === 'number' &&
  error.status >= 400 &&
  error.status < 500;

export const notFoundHandler: RequestHandler = () => {
  throw notFound('Route');
};

export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof AppError) {
      const { code, message, details } = error;
      res
        .status(statusFor[code])
        .json({ error: { code, message, details } } satisfies ErrorResponse);
      return;
    }
    if (isClientError(error)) {
      const message = error.expose ? error.message : 'Bad request';
      res
        .status(error.status)
        .json({ error: { code: 'BAD_REQUEST', message } } satisfies ErrorResponse);
      return;
    }
    logger.error(error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    } satisfies ErrorResponse);
  };
