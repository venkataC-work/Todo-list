import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { conflict, notFound, rateLimited, unauthorized, validationError } from '../errors.js';
import { errorHandler } from './error-handler.js';

const respond = (error: unknown, headersSent = false) => {
  const json = vi.fn();
  const response = { headersSent, status: vi.fn().mockReturnValue({ json }) };
  const next = vi.fn();
  const logger = { error: vi.fn() };
  errorHandler(logger)(error, {} as Request, response as unknown as Response, next as NextFunction);
  return { response, json, next, logger };
};

describe('application error HTTP adapter', () => {
  it.each([
    [validationError('Invalid title', [{ path: 'title', message: 'Required' }]), 400],
    [unauthorized(), 401],
    [notFound('Task'), 404],
    [conflict('Email already registered'), 409],
    [rateLimited(), 429],
  ])('maps %s to HTTP %s', (error, status) => {
    const { response, json, logger } = respond(error);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(json).toHaveBeenCalledWith({
      error: { code: error.code, message: error.message, details: error.details },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('passes errors on after headers were sent', () => {
    const error = new Error('Stream interrupted');
    const { response, next } = respond(error, true);
    expect(next).toHaveBeenCalledWith(error);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('keeps unexpected failures out of the response', () => {
    const error = new Error('Private database details');
    const { response, json, logger } = respond(error);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(logger.error).toHaveBeenCalledWith(error);
  });

  it('hides messages from unexposed framework errors', () => {
    const { response, json } = respond({ status: 400, message: 'Internal parser details' });
    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: { code: 'BAD_REQUEST', message: 'Bad request' } });
  });
});
