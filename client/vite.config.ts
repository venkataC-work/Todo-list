import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Read only development ports from the root file, never API secrets.
  const ports = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), ['PORT', 'WEB_PORT']);
  const port = (name: string, fallback: number) => {
    const value = Number(ports[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${name} must be an integer between 1 and 65535`);
    }
    return value;
  };
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: port('WEB_PORT', 5173),
      strictPort: true,
      proxy: { '/api': `http://localhost:${port('PORT', 4000)}` },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
        thresholds: { lines: 85, functions: 80, branches: 80, statements: 85 },
      },
    },
  };
});
