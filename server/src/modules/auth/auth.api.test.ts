import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../../testing/app.js';

describe('auth API', () => {
  describe('POST /api/auth/register', () => {
    it('creates an account and returns a session without the password hash', async () => {
      const { app } = await buildTestApp();
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: '  Ada@Example.com ', password: 'correct-horse', name: 'Ada' })
        .expect(201);

      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: 'ada@example.com',
        name: 'Ada',
        createdAt: expect.any(String),
      });
    });

    it('rejects duplicate emails with 409', async () => {
      const { app, signUp } = await buildTestApp();
      await signUp('ada@example.com');
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ADA@example.com', password: 'another-pass', name: 'Ada 2' })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('returns field-level validation errors with 400', async () => {
      const { app } = await buildTestApp();
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'nope', password: 'short', name: '' })
        .expect(400);
      expect(res.body.error.details.map(({ path }: { path: string }) => path).sort()).toEqual([
        'email',
        'name',
        'password',
      ]);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a session for valid credentials', async () => {
      const { app, signUp } = await buildTestApp();
      await signUp();
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'correct-horse' })
        .expect(200);
      expect(res.body.user.email).toBe('ada@example.com');
    });

    it.each([
      ['wrong password', { email: 'ada@example.com', password: 'wrong-horse' }],
      ['unknown email', { email: 'bob@example.com', password: 'correct-horse' }],
    ])('rejects %s with a generic 401', async (_case, credentials) => {
      const { app, signUp } = await buildTestApp();
      await signUp();
      const res = await request(app).post('/api/auth/login').send(credentials).expect(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('rate limits repeated attempts with 429', async () => {
      const { app } = await buildTestApp({ authRateLimit: 2 });
      const attempt = () =>
        request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
      await attempt().expect(401);
      await attempt().expect(401);
      const res = await attempt().expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the current user for a valid token', async () => {
      const { app, signUp } = await buildTestApp();
      const { headers, user } = await signUp();
      const res = await request(app).get('/api/auth/me').set(headers).expect(200);
      expect(res.body).toEqual(user);
    });

    it.each(['bearer', 'BEARER', 'Bearer   '])(
      'accepts the standard bearer scheme: %s',
      async (scheme) => {
        const { app, signUp } = await buildTestApp();
        const { token, user } = await signUp();
        await request(app)
          .get('/api/auth/me')
          .set('Authorization', `${scheme} ${token}`)
          .expect(200, user);
      },
    );

    it('rejects extra content after the token', async () => {
      const { app, signUp } = await buildTestApp();
      const { token } = await signUp();
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token} extra`)
        .expect(401);
    });

    it.each([
      ['no header', {}],
      ['wrong scheme', { Authorization: 'Basic abc' }],
      ['invalid token', { Authorization: 'Bearer nope' }],
    ])('rejects %s with 401', async (_case, headers) => {
      const { app } = await buildTestApp();
      await request(app).get('/api/auth/me').set(headers).expect(401);
    });

    it('rejects tokens for users that no longer exist', async () => {
      const { app, services } = await buildTestApp();
      const token = services.tokens.sign('ghost');
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });
});
