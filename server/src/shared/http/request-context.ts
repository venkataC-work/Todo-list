import type { Response } from 'express';
import { unauthorized } from '../errors.js';

/** Reads the user id placed on the response by `requireAuth`. */
export const currentUserId = (res: Response): string => {
  const { userId } = res.locals;
  if (typeof userId !== 'string') throw unauthorized();
  return userId;
};
