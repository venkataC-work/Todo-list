import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';
import { memoryPersistence } from '../infrastructure/store/persistence.js';
import { emptyState } from '../infrastructure/store/store.js';
import { bootstrap } from './bootstrap.js';

describe('application startup', () => {
  it('creates an empty application without opening a server', async () => {
    const { app, store } = await bootstrap(loadConfig({}));
    expect(typeof app).toBe('function');
    expect(await store.read()).toEqual(emptyState());
  });

  it('uses injected storage for registered accounts', async () => {
    const { store, services } = await bootstrap(loadConfig({}), {
      persistence: memoryPersistence(),
    });
    const session = await services.auth.register({
      email: 'ada@example.com',
      name: 'Ada',
      password: 'correct-horse',
    });
    expect(session.user.email).toBe('ada@example.com');
    expect((await store.read()).users).toHaveLength(1);
    expect((await store.read()).tasks).toHaveLength(0);
  });

  it('loads the configured file and rejects invalid data without overwriting it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'todo-bootstrap-'));
    const dataFile = join(directory, 'tasks.json');
    try {
      const config = loadConfig({ DATA_FILE: dataFile });
      await writeFile(dataFile, JSON.stringify(emptyState()));
      expect(await (await bootstrap(config)).store.read()).toEqual(emptyState());
      await writeFile(dataFile, JSON.stringify({ users: 'invalid', tasks: [] }));
      await expect(bootstrap(config)).rejects.toThrow('Saved data is invalid');
      expect(JSON.parse(await readFile(dataFile, 'utf8'))).toEqual({ users: 'invalid', tasks: [] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
