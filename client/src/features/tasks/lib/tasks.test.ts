import { describe, expect, it } from 'vitest';
import { task } from '@/test/fixtures';
import { changedTaskFields, formatTimestamp, summarize, toTaskInput } from './tasks';

describe('task transformations', () => {
  it('counts statuses and selects editable fields', () => {
    expect(summarize([task('a'), task('b', { completed: true })])).toEqual({
      total: 2,
      completed: 1,
      active: 1,
    });
    expect(summarize([])).toEqual({ total: 0, completed: 0, active: 0 });
    expect(toTaskInput(task())).toEqual({
      title: 'Task one',
      description: 'Some useful notes',
      completed: false,
    });
  });
});

it('formats the last updated time', () => {
  expect(formatTimestamp('2026-06-10T12:00:00Z')).toContain('Jun 10');
});

it('selects changed fields including clearing notes and unchecking completion', () => {
  const initial = { title: 'Read', description: 'Notes', completed: true };
  expect(changedTaskFields({ ...initial, description: '', completed: false }, initial)).toEqual({
    description: '',
    completed: false,
  });
  expect(changedTaskFields(initial, initial)).toEqual({});
});
