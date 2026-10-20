import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testing/app.js';

describe('app', () => {
  it('reports health', async () => {
    const { app } = await buildTestApp();
    await request(app).get('/api/health').expect(200, { status: 'ok' });
  });

  it.each(['localhost:4000', '127.0.0.1:4000', '[::1]:4000'])(
    'keeps HTTP previews usable while retaining security headers for %s',
    async (host) => {
      const { app } = await buildTestApp();
      const response = await request(app).get('/api/health').set('Host', host).expect(200);
      const policy = response.headers['content-security-policy'];
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("frame-ancestors 'self'");
      expect(policy).not.toContain('upgrade-insecure-requests');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    },
  );

  it('retains HTTPS upgrade protection for hosted origins', async () => {
    const { app } = await buildTestApp();
    const response = await request(app)
      .get('/api/health')
      .set('Host', 'tasks.example.com')
      .set('X-Forwarded-Host', 'localhost')
      .expect(200);
    expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const { app } = await buildTestApp();
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Route not found' });
  });

  it('allows configured CORS origins only', async () => {
    const { app } = await buildTestApp();
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('logs unexpected errors and hides internals behind a 500', async () => {
    const logger = { error: vi.fn() };
    const { app, services, signUp } = await buildTestApp({}, logger);
    const { headers } = await signUp();
    vi.spyOn(services.tasks, 'list').mockRejectedValue(new Error('db exploded'));

    const res = await request(app).get('/api/tasks').set(headers).expect(500);

    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'db exploded' }));
  });

  it('serves the SPA with client-side route fallback when staticDir is set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'todo-static-'));
    await writeFile(join(dir, 'index.html'), '<h1>Todo</h1>');
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'app-hash.js'), 'export {};');
    try {
      const { app } = await buildTestApp({ staticDir: dir });
      await request(app).get('/tasks/123').expect(200, '<h1>Todo</h1>');
      await request(app).get('/api/unknown').expect(404);
      await request(app).get('/api').expect(404);
      await request(app).get('/assets/missing.js').expect(404);
      await request(app)
        .get('/assets/app-hash.js')
        .expect('Cache-Control', /immutable/)
        .expect(200);
      await request(app).get('/index.html').expect('Cache-Control', 'no-cache').expect(200);
      await request(app).get('/tasks').expect('Cache-Control', 'no-cache').expect(200);
      await request(app).post('/tasks').expect(404);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
