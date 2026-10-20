import type { RequestHandler } from 'express';
import { unauthorized } from '../../shared/errors.js';
import type { AuthService } from './auth.service.js';
import type { TokenService } from './tokens.js';

const bearerToken = (header = '') => /^Bearer[ \t]+(\S+)$/i.exec(header.trim())?.[1];

export const requireAuth =
  (tokens: TokenService, getUser: AuthService['getUser']): RequestHandler =>
  async (req, res, next) => {
    const token = bearerToken(req.headers.authorization);
    const userId = token && tokens.verify(token);
    if (!userId) throw unauthorized();
    await getUser(userId);
    res.locals.userId = userId;
    next();
  };
