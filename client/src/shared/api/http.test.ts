import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpClient } from './http';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('HTTP client', () => {
  it('sends authenticated JSON and supports every task method', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createHttpClient({ baseUrl: 'https://api.example', getToken: () => 'abc' });
    await client.get('/tasks');
    await client.post('/tasks', { title: 'Read' });
    await client.put('/order', { ids: [] });
    await client.patch('/tasks/1', { completed: true });
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example/tasks',
      expect.objectContaining({
        body: '{"title":"Read"}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer abc',
        },
      }),
    );
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client.delete('/tasks/1')).resolves.toBeUndefined();
  });
  it('clears an authenticated session on 401 and exposes field errors', async () => {
    const clear = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'INVALID',
              message: 'Please fix this',
              details: [{ path: 'title', message: 'Required' }],
            },
          },
          401,
        ),
      ),
    );
    const client = createHttpClient({ getToken: () => 'expired', onUnauthorized: clear });
    const error = await client.get('/tasks').catch((cause: unknown) => cause);
    expect(clear).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldErrors).toEqual({ title: 'Required' });
  });
  it('does not clear a session for a failed anonymous login', async () => {
    const clear = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)));
    await expect(
      createHttpClient({ getToken: () => undefined, onUnauthorized: clear }).post('/login', {}),
    ).rejects.toMatchObject({ status: 401, code: 'UNKNOWN' });
    expect(clear).not.toHaveBeenCalled();
  });
  it('handles network errors and non-JSON responses', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const client = createHttpClient({ getToken: () => undefined });
    await expect(client.get('/tasks')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    await expect(client.get('/tasks')).rejects.toThrow('Request failed (502)');
    fetchMock.mockResolvedValue(json(null, 500));
    await expect(client.get('/tasks')).rejects.toThrow('Request failed (500)');
  });
});

describe('request lifecycle', () => {
  const waitForAbort = () =>
    vi.fn().mockImplementation(
      (_url, { signal }: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );

  it('times out stalled requests and leaves the user signed in', async () => {
    vi.useFakeTimers();
    try {
      const clear = vi.fn();
      vi.stubGlobal('fetch', waitForAbort());
      const client = createHttpClient({
        getToken: () => 'valid',
        onUnauthorized: clear,
        timeoutMs: 50,
      });
      const assertion = expect(client.get('/tasks')).rejects.toMatchObject({
        code: 'TIMEOUT',
        status: 0,
      });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      expect(clear).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an in-flight request when its caller aborts', async () => {
    vi.stubGlobal('fetch', waitForAbort());
    const controller = new AbortController();
    const request = createHttpClient({ getToken: () => undefined }).get('/tasks', {
      signal: controller.signal,
    });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not send a request which was already cancelled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      createHttpClient({ getToken: () => undefined }).get('/tasks', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unreadable success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));
    await expect(
      createHttpClient({ getToken: () => undefined }).get('/tasks'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('discards malformed error fields and keeps valid field errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        {
          error: {
            code: 123,
            message: false,
            details: [
              null,
              { path: 'title', message: 'Required' },
              { path: 42, message: 'Invalid' },
            ],
          },
        },
        400,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createHttpClient({ getToken: () => undefined });
    const error = await client.get('/tasks').catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: 'UNKNOWN', message: 'Request failed (400)' });
    expect((error as ApiError).fieldErrors).toEqual({ title: 'Required' });
    fetchMock.mockResolvedValue(json({ error: 'invalid' }, 500));
    await expect(client.get('/tasks')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});
