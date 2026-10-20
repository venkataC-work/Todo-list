import type { z } from 'zod';
import { validationError } from '../errors.js';

/** Parses untrusted input against a schema, throwing a 400 with field-level details on failure. */
export const parse = <S extends z.ZodType>(schema: S, input: unknown): z.output<S> => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw validationError(
    'Invalid request',
    result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
  );
};
