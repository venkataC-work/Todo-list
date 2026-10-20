import { describe, expect, it, vi } from 'vitest';
import { createSessionStore } from './session-store';
import { session } from '@/test/fixtures';

describe('session storage', () => {
  it('only accepts the latest authentication attempt', () => {
    const store = createSessionStore();
    const earlier = store.beginAuthentication();
    const latest = store.beginAuthentication();
    earlier(session);
    expect(store.get()).toBeNull();
    const newer = { ...session, token: 'newer' };
    latest(newer);
    earlier(session);
    expect(store.get()).toEqual(newer);
  });

  it('invalidates pending authentication even when signing out from an empty session', () => {
    const store = createSessionStore();
    const complete = store.beginAuthentication();
    store.clear();
    complete(session);
    expect(store.get()).toBeNull();
  });

  it('does not overwrite another tab before its storage event arrives', () => {
    localStorage.clear();
    const store = createSessionStore(localStorage);
    const complete = store.beginAuthentication();
    const newer = { ...session, token: 'other-tab' };
    localStorage.setItem('momentum.session', JSON.stringify(newer));
    complete(session);
    expect(createSessionStore(localStorage).get()).toEqual(newer);
    store.clear();
  });

  it('does not restore a pending session after a remote sign-in followed by sign-out', () => {
    localStorage.clear();
    const store = createSessionStore(localStorage, window);
    const complete = store.beginAuthentication();
    try {
      localStorage.setItem('momentum.session', JSON.stringify(session));
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'momentum.session', storageArea: localStorage }),
      );
      localStorage.removeItem('momentum.session');
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'momentum.session', storageArea: localStorage }),
      );
      complete(session);
      expect(store.get()).toBeNull();
      expect(localStorage.getItem('momentum.session')).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('persists, restores and clears sessions', () => {
    localStorage.clear();
    const store = createSessionStore(localStorage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(session);
    expect(createSessionStore(localStorage).get()).toEqual(session);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.clear();
    expect(createSessionStore(localStorage).get()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });
  it.each([
    'garbage',
    '{"token":"x","user":{"id":"a"}}',
    '{}',
    'null',
    '{"token":1,"user":{"id":"a"}}',
  ])('discards invalid saved data: %s', (value) => {
    localStorage.setItem('momentum.session', value);
    expect(createSessionStore(localStorage).get()).toBeNull();
  });
  it('keeps sign-in working when storage is blocked', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const store = createSessionStore(storage);
    expect(store.get()).toBeNull();
    store.beginAuthentication()(session);
    expect(store.get()).toEqual(session);
    store.clear();
    expect(() => store.set(session)).not.toThrow();
    expect(store.get()).toEqual(session);
    expect(() => store.clear()).not.toThrow();
  });
});

it('synchronizes remote session changes without writing them back', () => {
  localStorage.clear();
  const store = createSessionStore(localStorage, window);
  const notify = (key: string | null, storageArea = localStorage) =>
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea }));
  try {
    localStorage.setItem('momentum.session', JSON.stringify(session));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    notify('momentum.session');
    expect(store.get()).toEqual(session);
    expect(setItem).not.toHaveBeenCalled();
    const replacement = {
      ...session,
      token: 'replacement',
      user: { ...session.user, id: 'another-user' },
    };
    localStorage.setItem('momentum.session', JSON.stringify(replacement));
    notify('unrelated-key');
    notify('momentum.session', sessionStorage);
    expect(store.get()).toEqual(session);
    notify('momentum.session');
    expect(store.get()).toEqual(replacement);
    localStorage.clear();
    notify(null);
    expect(store.get()).toBeNull();
    localStorage.setItem('momentum.session', 'broken JSON');
    notify('momentum.session');
    expect(store.get()).toBeNull();
    store.dispose();
    localStorage.setItem('momentum.session', JSON.stringify(session));
    notify('momentum.session');
    expect(store.get()).toBeNull();
  } finally {
    store.dispose();
  }
});
