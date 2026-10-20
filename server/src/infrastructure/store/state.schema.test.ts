import { describe, expect, it } from 'vitest';
import { parseSavedState } from './state.schema.js';

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  passwordHash: 'salt:key',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const task = {
  id: 't1',
  userId: 'u1',
  title: 'Read',
  description: '',
  completed: false,
  position: 0,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('saved data validation', () => {
  it('loads a valid state without changing its data', () => {
    const state = { users: [user], tasks: [task] };
    expect(parseSavedState(state)).toEqual(state);
  });

  it('loads older task files while dropping retired metadata', () => {
    const state = { users: [user], tasks: [{ ...task, priority: 'high', dueDate: '2026-12-01' }] };
    expect(parseSavedState(state)).toEqual({ users: [user], tasks: [task] });
    expect(state.tasks[0]?.priority).toBe('high');
  });

  it('adds an initial version when loading older task files', () => {
    const { version, ...legacyTask } = task;
    expect(version).toBe(1);
    expect(parseSavedState({ users: [user], tasks: [legacyTask] }).tasks).toEqual([task]);
  });

  it.each([
    {},
    { users: [user], tasks: [{ ...task, version: 0 }] },
    { users: 'not-an-array', tasks: [] },
    { users: [user], tasks: [{ ...task, priority: 'urgent' }] },
    { users: [user], tasks: [{ ...task, dueDate: '2026-02-30' }] },
    { users: [user, { ...user, id: 'u2' }], tasks: [] },
    { users: [user, { ...user, email: 'other@example.com' }], tasks: [] },
    { users: [user], tasks: [task, task] },
    { users: [], tasks: [task] },
  ])('refuses malformed or inconsistent data: %j', (state) => {
    expect(() => parseSavedState(state)).toThrow('Saved data is invalid');
  });
});
