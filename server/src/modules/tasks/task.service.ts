import { randomUUID } from 'node:crypto';
import { validationError, notFound, conflict } from '../../shared/errors.js';
import type { Store } from '../../infrastructure/store/store.js';
import type { DataState } from '../../infrastructure/store/state.js';
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
import type { CreateTaskInput, ListQuery, UpdateTaskInput } from './task.schemas.js';

export interface TaskService {
  list: (userId: string, query: ListQuery) => Promise<Task[]>;
  get: (userId: string, id: string) => Promise<Task>;
  create: (userId: string, input: CreateTaskInput) => Promise<Task>;
  update: (userId: string, id: string, patch: UpdateTaskInput) => Promise<Task>;
  remove: (userId: string, id: string) => Promise<void>;
  reorder: (userId: string, ids: string[]) => Promise<Task[]>;
}

interface Deps {
  store: Store;
  clock?: () => string;
  generateId?: () => string;
}

const tasksOf = (state: DataState, userId: string) =>
  state.tasks.filter(ownedBy(userId)).sort(byPosition);

/** Missing and foreign tasks both yield 404 so ids belonging to other users are not disclosed. */
const findOwned = (state: DataState, userId: string, id: string) => {
  const task = state.tasks.find(allPass(ownedBy(userId), (candidate) => candidate.id === id));
  if (!task) throw notFound('Task');
  return task;
};

const withTasks = (state: DataState, changed: readonly Task[]): DataState => {
  const byId = new Map(changed.map((task) => [task.id, task]));
  return { ...state, tasks: state.tasks.map((task) => byId.get(task.id) ?? task) };
};

export const createTaskService = ({
  store,
  clock = () => new Date().toISOString(),
  generateId = randomUUID,
}: Deps): TaskService => ({
  list: async (userId, { q, status }) =>
    (await store.read()).tasks
      .filter(allPass(ownedBy(userId), matchesQuery(q), matchesStatus(status)))
      .sort(byPosition),

  get: async (userId, id) => findOwned(await store.read(), userId, id),

  create: (userId, input) =>
    store.update((state) => {
      const now = clock();
      const task: Task = {
        ...input,
        id: generateId(),
        userId,
        position: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const ordered = renumber([task, ...tasksOf(state, userId)]);
      const next = withTasks({ ...state, tasks: [...state.tasks, task] }, ordered);
      return { state: next, result: ordered[0] as Task };
    }),

  update: (userId, id, patch) =>
    store.update((state) => {
      const current = findOwned(state, userId, id);
      if (patch.version !== current.version) {
        throw conflict(
          'This task changed in another tab. Load the latest task before saving again.',
        );
      }
      const task = { ...current, ...patch, version: current.version + 1, updatedAt: clock() };
      return { state: withTasks(state, [task]), result: task };
    }),

  remove: (userId, id) =>
    store.update((state) => {
      findOwned(state, userId, id);
      const remaining = { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
      return {
        state: withTasks(remaining, renumber(tasksOf(remaining, userId))),
        result: undefined,
      };
    }),

  reorder: (userId, ids) =>
    store.update((state) => {
      const tasks = tasksOf(state, userId);
      const byId = new Map(tasks.map((task) => [task.id, task]));
      const unknown = ids.filter((id) => !byId.has(id));
      if (unknown.length > 0) {
        throw validationError(
          'Unknown task ids',
          unknown.map((id) => ({ path: 'ids', message: `Task ${id} not found` })),
        );
      }
      const ordered = renumber(
        reorderSubset([...byId.keys()], ids).map((id) => byId.get(id) as Task),
      );
      return { state: withTasks(state, ordered), result: ordered };
    }),
});
