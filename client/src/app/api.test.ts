import { describe, expect, it, vi } from 'vitest';
import { authApi } from '@/features/auth/api/auth-api';
import { tasksApi } from '@/features/tasks/api/tasks-api';
import { sessionStore } from '@/shared/session/session-store';
import { session, task } from '@/test/fixtures';

describe('API resource paths', () => {
  it('encodes search terms, ids and JSON bodies', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(task()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    sessionStore.set(session);
    await tasksApi.list();
    await tasksApi.list({ q: 'milk & bread', status: 'active' });
    await tasksApi.get('a/b');
    await tasksApi.create({ title: 'Read' });
    await tasksApi.update('a/b', { completed: true, version: 1 });
    await tasksApi.reorder(['b', 'a']);
    await tasksApi.remove('a/b');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/tasks',
      '/api/tasks?q=milk+%26+bread&status=active',
      '/api/tasks/a%2Fb',
      '/api/tasks',
      '/api/tasks/a%2Fb',
      '/api/tasks/order',
      '/api/tasks/a%2Fb',
    ]);
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({
      method: 'PATCH',
      body: '{"completed":true,"version":1}',
    });
  });
  it('sends login and registration to the correct endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(session)));
    vi.stubGlobal('fetch', fetchMock);
    const credentials = { email: 'ada@example.com', password: 'correct-horse' };
    await expect(authApi.login(credentials)).resolves.toEqual(session);
    await expect(authApi.register({ ...credentials, name: 'Ada' })).resolves.toEqual(session);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/login',
      '/api/auth/register',
    ]);
  });
});

describe('late authentication responses', () => {
  it('does not sign out a newer session when an older request returns 401', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    sessionStore.set(session);
    const request = tasksApi.list();
    sessionStore.set({ ...session, token: 'new-token' });
    finish(new Response('{}', { status: 401 }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(sessionStore.get()?.token).toBe('new-token');
  });
  it('clears the matching session after a rejected token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    sessionStore.set(session);
    await expect(tasksApi.list()).rejects.toMatchObject({ status: 401 });
    expect(sessionStore.get()).toBeNull();
  });
});
