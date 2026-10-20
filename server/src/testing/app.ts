import request from 'supertest';
import { createApp } from '../app/create-app.js';
import { createServices } from '../app/create-services.js';
import { memoryPersistence } from '../infrastructure/store/persistence.js';
import { createStore } from '../infrastructure/store/store.js';
import type { Logger } from '../shared/logger.js';

export const testConfig = {
  jwtSecret: 'test-secret',
  tokenTtlSeconds: 3600,
  corsOrigins: ['http://localhost:5173'],
  authRateLimit: 1000,
};

export const buildTestApp = async (
  overrides: Partial<typeof testConfig & { staticDir: string }> = {},
  logger?: Logger,
) => {
  const config = { ...testConfig, ...overrides };
  const store = await createStore(memoryPersistence());
  const services = createServices(store, config);
  const app = createApp({ services, config, logger });

  const signUp = async (email = 'ada@example.com') => {
    const { body } = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'correct-horse', name: 'Ada' })
      .expect(201);
    return { ...body, headers: { Authorization: `Bearer ${body.token}` } } as {
      token: string;
      user: { id: string; email: string; name: string };
      headers: { Authorization: string };
    };
  };

  return { app, store, services, signUp };
};
