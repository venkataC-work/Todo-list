import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@todo/contracts';
import type { User } from '../../modules/auth/auth.types.js';
import { filePersistence, memoryPersistence } from './persistence.js';
import { createSerialQueue } from './serial-queue.js';
import { createStore, emptyState } from './store.js';

const user: User = {
  id: 'u1',
  email: 'a@b.co',
  name: 'A',
  passwordHash: 'x:y',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const task: Task = {
  id: 't1',
  userId: user.id,
  title: 'Read',
  description: '',
  completed: false,
  position: 0,
  version: 1,
  createdAt: user.createdAt,
  updatedAt: user.createdAt,
};

const addUser = (id: string) => (state: ReturnType<typeof emptyState>) => ({
  state: { ...state, users: [...state.users, { ...user, id }] },
  result: id,
});

describe('createSerialQueue', () => {
  it('runs jobs one at a time in call order', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const job = (name: string, ms: number) => () =>
      new Promise<string>((resolve) =>
        setTimeout(() => {
          log.push(name);
          resolve(name);
        }, ms),
      );

    const results = await Promise.all([enqueue(job('slow', 20)), enqueue(job('fast', 1))]);

    expect(results).toEqual(['slow', 'fast']);
    expect(log).toEqual(['slow', 'fast']);
  });

  it('keeps processing after a job fails', async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(() => Promise.reject(new Error('boom')));
    await expect(failed).rejects.toThrow('boom');
    await expect(enqueue(async () => 'next')).resolves.toBe('next');
  });
});

describe('createStore', () => {
  it('starts empty and applies transitions', async () => {
    const store = await createStore(memoryPersistence());
    expect(await store.read()).toEqual(emptyState());
    await expect(store.update(addUser('u1'))).resolves.toBe('u1');
    expect((await store.read()).users).toHaveLength(1);
  });

  it('serializes concurrent updates without losing writes', async () => {
    const store = await createStore(memoryPersistence());
    await Promise.all(['a', 'b', 'c'].map((id) => store.update(addUser(id))));
    expect((await store.read()).users.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves state untouched when a transition throws', async () => {
    const store = await createStore(memoryPersistence());
    await expect(
      store.update(() => {
        throw new Error('invalid');
      }),
    ).rejects.toThrow('invalid');
    expect(await store.read()).toEqual(emptyState());
  });

  it('leaves state untouched when persisting fails', async () => {
    const persistence = {
      ...memoryPersistence(),
      save: vi.fn().mockRejectedValue(new Error('disk')),
    };
    const store = await createStore(persistence);
    await expect(store.update(addUser('u1'))).rejects.toThrow('disk');
    expect((await store.read()).users).toEqual([]);
  });
});

describe('filePersistence', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'todo-store-'));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('returns undefined when the file does not exist', async () => {
    await expect(filePersistence(join(dir, 'missing.json')).load()).resolves.toBeUndefined();
  });

  it('round-trips state through disk, creating directories as needed', async () => {
    const path = join(dir, 'nested', 'db.json');
    const store = await createStore(filePersistence(path));
    await store.update(addUser('u1'));

    const reloaded = await createStore(filePersistence(path));
    expect((await reloaded.read()).users.map(({ id }) => id)).toEqual(['u1']);
    expect(JSON.parse(await readFile(path, 'utf8')).users).toHaveLength(1);
  });

  it('surfaces corrupt files instead of silently resetting data', async () => {
    const path = join(dir, 'db.json');
    await writeFile(path, '{not json');
    await expect(filePersistence(path).load()).rejects.toThrow(SyntaxError);
  });
});

describe('failed atomic writes', () => {
  it('removes temporary files when the final rename fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'todo-write-failure-'));
    try {
      const destination = join(directory, 'existing-directory');
      await mkdir(destination);
      await expect(filePersistence(destination).save(emptyState())).rejects.toThrow();
      expect(await readdir(directory)).toEqual(['existing-directory']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

it('protects loaded records and arrays from mutation without freezing caller-owned data', async () => {
  const input = { users: [{ ...user }], tasks: [{ ...task }] };
  const store = await createStore(memoryPersistence(input));
  const snapshot = await store.read();
  expect(() => Object.assign(snapshot.users[0]!, { name: 'Changed behind the store' })).toThrow(
    TypeError,
  );
  expect(() => Object.assign(snapshot, { users: [] })).toThrow(TypeError);
  expect(() => Object.assign(snapshot.users, { 0: { ...user, name: 'Replacement' } })).toThrow(
    TypeError,
  );
  expect(() => Object.assign(snapshot.tasks[0]!, { title: 'Unsaved edit' })).toThrow(TypeError);
  expect(() => Object.assign(snapshot.tasks, { 0: { ...task, title: 'Replacement' } })).toThrow(
    TypeError,
  );
  input.tasks[0]!.title = 'Caller-owned task edit';
  expect((await store.read()).tasks[0]?.title).toBe('Read');
  input.users[0]!.name = 'Caller-owned edit';
  expect((await store.read()).users[0]?.name).toBe('A');
});

it('rejects mutating transitions without saving and keeps the queue usable', async () => {
  const persistence = { ...memoryPersistence({ users: [{ ...user }], tasks: [] }), save: vi.fn() };
  const store = await createStore(persistence);
  await expect(
    store.update((state) => {
      Object.assign(state.users[0]!, { name: 'Accidental mutation' });
      return { state, result: undefined };
    }),
  ).rejects.toThrow(TypeError);
  expect(persistence.save).not.toHaveBeenCalled();
  expect((await store.read()).users[0]?.name).toBe('A');
  await store.update(addUser('u2'));
  expect((await store.read()).users).toHaveLength(2);
});

it('keeps committed state independent of transition results and retained write inputs', async () => {
  const store = await createStore(memoryPersistence());
  const created = { ...user };
  const next = { users: [created], tasks: [{ ...task }] };
  const result = await store.update(() => ({ state: next, result: created }));
  result.name = 'Edit to returned result';
  next.tasks[0]!.title = 'Edit to retained transition input';
  next.users.length = 0;
  const current = await store.read();
  expect(current.users[0]?.name).toBe('A');
  expect(current.tasks[0]?.title).toBe('Read');
});
