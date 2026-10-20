import { describe, expect, it } from 'vitest';
import type { Task } from '@todo/contracts';
import {
  allPass,
  byPosition,
  matchesQuery,
  matchesStatus,
  ownedBy,
  renumber,
  reorderSubset,
} from './task.logic.js';

const task = (overrides: Partial<Task>): Task => ({
  id: 't1',
  userId: 'u1',
  title: 'Write report',
  description: '',
  completed: false,
  position: 0,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('reorderSubset', () => {
  it('reorders the full list when every id is given', () => {
    expect(reorderSubset(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('permutes a subset within the slots it already occupies', () => {
    expect(reorderSubset(['a', 'b', 'c', 'd', 'e'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b', 'e']);
  });

  it('leaves the list unchanged for an empty subset', () => {
    expect(reorderSubset(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('renumber', () => {
  it('assigns dense positions in list order, reusing unchanged objects', () => {
    const first = task({ id: 'a', position: 0 });
    const result = renumber([first, task({ id: 'b', position: 5 })]);
    expect(result.map((t) => t.position)).toEqual([0, 1]);
    expect(result[0]).toBe(first);
  });
});

describe('predicates', () => {
  it('matchesQuery is case-insensitive across title and description', () => {
    const match = matchesQuery('REPORT');
    expect(match(task({ title: 'Quarterly report' }))).toBe(true);
    expect(match(task({ title: 'Other', description: 'attach the report' }))).toBe(true);
    expect(match(task({ title: 'Other' }))).toBe(false);
    expect(matchesQuery(undefined)(task({}))).toBe(true);
  });

  it('matchesStatus filters by completion', () => {
    const done = task({ completed: true });
    const open = task({ completed: false });
    expect([done, open].filter(matchesStatus('completed'))).toEqual([done]);
    expect([done, open].filter(matchesStatus('active'))).toEqual([open]);
    expect([done, open].filter(matchesStatus('all'))).toEqual([done, open]);
  });

  it('ownedBy and allPass compose', () => {
    const tasks = [task({ id: 'a', userId: 'u1' }), task({ id: 'b', userId: 'u2' })];
    const visible = tasks.filter(allPass(ownedBy('u1'), matchesStatus('active')));
    expect(visible.map((t) => t.id)).toEqual(['a']);
  });

  it('byPosition sorts ascending', () => {
    const sorted = [task({ id: 'b', position: 1 }), task({ id: 'a', position: 0 })].sort(
      byPosition,
    );
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
