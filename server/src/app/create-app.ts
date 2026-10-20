import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { authRouter } from '../modules/auth/auth.routes.js';
import { requireAuth } from '../modules/auth/require-auth.js';
import type { Config } from '../config/env.js';
import { errorHandler, notFoundHandler } from '../shared/http/error-handler.js';
import { rateLimited } from '../shared/errors.js';
import type { Services } from './create-services.js';
import { taskRouter } from '../modules/tasks/task.routes.js';
import type { Logger } from '../shared/logger.js';
import { serveClient } from '../shared/http/serve-client.js';

type AppConfig = Pick<Config, 'corsOrigins' | 'authRateLimit' | 'staticDir'>;

interface AppOptions {
  services: Services;
  config: AppConfig;
  logger?: Logger;
}

const silentLogger: Logger = { error: () => undefined };

const defaultHeaders = helmet();
const localPreviewHeaders = helmet({
  contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
});
const securityHeaders: RequestHandler = (req, res, next) => {
  // Safari upgrades local HTTP assets to HTTPS unless this directive is omitted.
  const localPreview = !req.secure && ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname);
  return (localPreview ? localPreviewHeaders : defaultHeaders)(req, res, next);
};

const authLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(rateLimited()),
  });

export const createApp = ({ services, config, logger = silentLogger }: AppOptions): Express => {
  const authenticate = requireAuth(services.tokens, services.auth.getUser);
  const app = express()
    .use(securityHeaders)
    .use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : false }))
    .use(express.json({ limit: '100kb' }))
    .get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    })
    .use(
      '/api/auth',
      authRouter({ auth: services.auth, authenticate, limiter: authLimiter(config.authRateLimit) }),
    )
    .use('/api/tasks', authenticate, taskRouter(services.tasks));

  if (config.staticDir) app.use(serveClient(config.staticDir));

  return app.use(notFoundHandler).use(errorHandler(logger));
};
