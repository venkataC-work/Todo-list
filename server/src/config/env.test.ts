import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('provides development defaults', () => {
    expect(loadConfig({})).toEqual({
      port: 4000,
      jwtSecret: expect.any(String),
      tokenTtlSeconds: 43_200,
      corsOrigins: [],
      authRateLimit: 20,
      dataFile: undefined,
      staticDir: undefined,
    });
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-production-secret-at-least-32-characters',
      PORT: '8080',
      CORS_ORIGINS: 'https://a.app, https://b.app',
      DATA_FILE: '/data/db.json',
    });
    expect(config).toMatchObject({
      port: 8080,
      jwtSecret: 'a-production-secret-at-least-32-characters',
      corsOrigins: ['https://a.app', 'https://b.app'],
      dataFile: '/data/db.json',
    });
  });

  it('refuses to start in production without a JWT secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it.each(['short', 'dev-only-insecure-secret'])(
    'rejects unsafe production secrets: %s',
    (secret) => {
      expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret })).toThrow(
        /JWT_SECRET/,
      );
    },
  );

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['TOKEN_TTL_SECONDS', '0'],
    ['AUTH_RATE_LIMIT', '-1'],
  ])('rejects invalid configuration %s=%s', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  });
});

describe('configuration boundaries', () => {
  it('normalizes and deduplicates allowed origins', () => {
    expect(
      loadConfig({
        CORS_ORIGINS: 'https://EXAMPLE.com/, https://example.com, http://localhost:5173',
      }).corsOrigins,
    ).toEqual(['https://example.com', 'http://localhost:5173']);
  });

  it.each([
    'https://example.com/path',
    'https://example.com?query=1',
    'https://example.com#section',
    'https://user:secret@example.com',
    'file:///tmp/file',
    'not-a-url',
  ])('rejects a CORS value which is not an origin: %s', (value) => {
    expect(() => loadConfig({ CORS_ORIGINS: value })).toThrow('CORS_ORIGINS');
  });

  it.each(['prod', 'staging', 'PRODUCTION'])('rejects an unknown runtime mode: %s', (value) => {
    expect(() => loadConfig({ NODE_ENV: value })).toThrow('NODE_ENV');
  });

  it('accepts test mode', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).port).toBe(4000);
  });

  it('rejects blank secrets and whitespace-padded short production secrets', () => {
    expect(() => loadConfig({ JWT_SECRET: ' ' })).toThrow('JWT_SECRET');
    expect(() =>
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: `short${' '.repeat(32)}` }),
    ).toThrow('JWT_SECRET');
  });
});
