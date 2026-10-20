import { useSyncExternalStore } from 'react';

export interface Observable<T> {
  get: () => T;
  set: (next: T | ((previous: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

/** Minimal external store, consumed in React through `useSyncExternalStore`. */
export const createObservable = <T>(initial: T): Observable<T> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useObservable = <T>({ subscribe, get }: Pick<Observable<T>, 'subscribe' | 'get'>) =>
  useSyncExternalStore(subscribe, get);
