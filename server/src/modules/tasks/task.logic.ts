import type { StatusFilter, Task } from '@todo/contracts';

type Predicate<T> = (value: T) => boolean;

export const allPass =
  <T>(...predicates: Predicate<T>[]): Predicate<T> =>
  (value) =>
    predicates.every((predicate) => predicate(value));

export const ownedBy =
  (userId: string): Predicate<Task> =>
  (task) =>
    task.userId === userId;

export const matchesQuery = (query?: string): Predicate<Task> => {
  const needle = query?.toLowerCase();
  return (task) =>
    !needle || [task.title, task.description].some((field) => field.toLowerCase().includes(needle));
};

export const matchesStatus =
  (status: StatusFilter): Predicate<Task> =>
  (task) =>
    status === 'all' || task.completed === (status === 'completed');

export const byPosition = (a: Task, b: Task) => a.position - b.position;

/** Assigns dense 0..n-1 positions following array order; untouched tasks keep their identity. */
export const renumber = (tasks: readonly Task[]): Task[] =>
  tasks.map((task, position) => (task.position === position ? task : { ...task, position }));

/**
 * Moves the ids in `subset` into the slots they already occupy within `ids`, in the new order.
 * This lets a client reorder a filtered view without disturbing tasks it cannot see.
 * Precondition: `subset` is a duplicate-free subset of `ids`.
 */
export const reorderSubset = (ids: readonly string[], subset: readonly string[]): string[] => {
  const members = new Set(subset);
  const replacements = subset.values();
  return ids.map((id) => (members.has(id) ? (replacements.next().value as string) : id));
};
