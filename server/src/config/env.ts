import { resolve } from 'node:path';

export interface Config {
  port: number;
  jwtSecret: string;
  tokenTtlSeconds: number;
  corsOrigins: string[];
  authRateLimit: number;
  dataFile?: string;
  staticDir?: string;
}

const DEV_SECRET = 'dev-only-insecure-secret';

const origins = (value = '') => [
  ...new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const message =
          'CORS_ORIGINS must contain HTTP(S) origins without credentials, paths, queries, or fragments';
        let url: URL;
        try {
          url = new URL(item);
        } catch {
          throw new Error(message);
        }
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash
        ) {
          throw new Error(message);
        }
        return url.origin;
      }),
  ),
];

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const mode = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(mode)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const production = mode === 'production';
  const jwtSecret = env.JWT_SECRET ?? DEV_SECRET;
  if (
    production &&
    (!env.JWT_SECRET || env.JWT_SECRET === DEV_SECRET || env.JWT_SECRET.trim().length < 32)
  ) {
    throw new Error(
      'JWT_SECRET must be a unique secret of at least 32 characters when NODE_ENV=production',
    );
  }
  if (!jwtSecret.trim()) throw new Error('JWT_SECRET must not be blank');
  const integer = (key: string, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new Error(`${key} must be an integer between 1 and ${max}`);
    }
    return value;
  };
  return {
    port: integer('PORT', 4000, 65535),
    jwtSecret,
    tokenTtlSeconds: integer('TOKEN_TTL_SECONDS', 60 * 60 * 12),
    corsOrigins: origins(env.CORS_ORIGINS),
    authRateLimit: integer('AUTH_RATE_LIMIT', 20),
    dataFile: env.DATA_FILE || undefined,
    staticDir: env.STATIC_DIR ? resolve(env.STATIC_DIR) : undefined,
  };
};
