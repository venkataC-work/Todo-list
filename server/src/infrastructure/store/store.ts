import type { DataState } from './state.js';
import type { Persistence } from './persistence.js';
import { createSerialQueue } from './serial-queue.js';

export interface Transition<R> {
  state: DataState;
  result: R;
}

export interface Store {
  read: () => Promise<DataState>;
  /**
   * Applies a pure state transition atomically. Transitions run serially; if one throws
   * or persisting fails, the in-memory state is left untouched.
   */
  update: <R>(transition: (state: DataState) => Transition<R>) => Promise<R>;
}

export const emptyState = (): DataState => ({ users: [], tasks: [] });

// Records contain primitive fields. Clone before freezing so caller-owned data stays independent.
const snapshot = ({ users, tasks }: DataState): DataState =>
  Object.freeze({
    users: Object.freeze(users.map((user) => Object.freeze({ ...user }))),
    tasks: Object.freeze(tasks.map((task) => Object.freeze({ ...task }))),
  });

export const createStore = async (persistence: Persistence): Promise<Store> => {
  let state = snapshot((await persistence.load()) ?? emptyState());
  const enqueue = createSerialQueue();

  return {
    read: async () => state,
    update: (transition) =>
      enqueue(async () => {
        const { state: next, result } = transition(state);
        const committed = snapshot(next);
        await persistence.save(committed);
        state = committed;
        return result;
      }),
  };
};
