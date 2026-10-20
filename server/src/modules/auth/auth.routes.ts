import { Router, type RequestHandler } from 'express';
import { parse } from '../../shared/http/parse.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import { currentUserId } from '../../shared/http/request-context.js';

interface Deps {
  auth: AuthService;
  authenticate: RequestHandler;
  limiter: RequestHandler;
}

export const authRouter = ({ auth, authenticate, limiter }: Deps) =>
  Router()
    .post('/register', limiter, async (req, res) => {
      res.status(201).json(await auth.register(parse(registerSchema, req.body)));
    })
    .post('/login', limiter, async (req, res) => {
      res.json(await auth.login(parse(loginSchema, req.body)));
    })
    .get('/me', authenticate, async (_req, res) => {
      res.json(await auth.getUser(currentUserId(res)));
    });
