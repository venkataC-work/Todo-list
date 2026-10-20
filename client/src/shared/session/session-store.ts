import type { Session } from '@todo/contracts';
import { createObservable, useObservable } from '../lib/observable';

const STORAGE_KEY = 'momentum.session';

const readStoredSession = (storage?: Storage) => {
  try {
    return storage?.getItem(STORAGE_KEY);
  } catch {
    return undefined;
  }
};

const isSession = (value: unknown): value is Session =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Session).token === 'string' &&
  Boolean((value as Session).token) &&
  typeof (value as Session).user?.id === 'string' &&
  typeof (value as Session).user.name === 'string' &&
  typeof (value as Session).user.email === 'string' &&
  typeof (value as Session).user.createdAt === 'string';

const restore = (storage?: Storage): Session | null => {
  try {
    const parsed: unknown = JSON.parse(readStoredSession(storage) ?? 'null');
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Session state persisted to storage so a refresh keeps the user signed in. */
export const createSessionStore = (storage?: Storage, events?: Window) => {
  const session = createObservable(restore(storage));
  let revision = 0;
  const set = (current: Session | null) => {
    revision += 1;
    try {
      if (current) storage?.setItem(STORAGE_KEY, JSON.stringify(current));
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing or a full storage quota must not break the current session.
    }
    session.set(current);
  };
  const synchronize = (event: StorageEvent) => {
    if (event.storageArea !== storage || (event.key !== null && event.key !== STORAGE_KEY)) return;
    // Read the current value rather than replaying an event that may already be stale.
    // Remote changes notify subscribers without writing back and causing an event loop.
    revision += 1;
    session.set(restore(storage));
  };
  if (storage) events?.addEventListener('storage', synchronize);
  return {
    get: session.get,
    subscribe: session.subscribe,
    set: (next: Session) => set(next),
    clear: () => set(null),
    beginAuthentication: () => {
      const startedAt = ++revision;
      const storedAtStart = readStoredSession(storage);
      return (next: Session) => {
        // Storage can change before the browser delivers the other tab's event.
        if (revision !== startedAt || readStoredSession(storage) !== storedAtStart) return;
        set(next);
      };
    },
    dispose: () => events?.removeEventListener('storage', synchronize),
  };
};

const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export const sessionStore = createSessionStore(
  browserStorage(),
  typeof window === 'undefined' ? undefined : window,
);

export const useSession = () => useObservable(sessionStore);
