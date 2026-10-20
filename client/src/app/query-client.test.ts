import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http';
import { createQueryClient } from './query-client';
import { toasts } from '@/shared/lib/toast';

describe('query error policy', () => {
  it('retries transient failures but never client errors', async () => {
    const client = createQueryClient();
    const retry = client.getDefaultOptions().queries?.retry;
    if (typeof retry !== 'function') throw new Error('Expected a retry policy');
    expect(retry(0, new ApiError(401, 'UNAUTHORIZED', 'Sign in'))).toBe(false);
    expect(retry(0, new Error('Network'))).toBe(true);
    expect(retry(1, new ApiError(503, 'UNAVAILABLE', 'Try again'))).toBe(true);
    expect(retry(2, new Error('Network'))).toBe(false);
    client.clear();
  });
  it('shows failed mutations unless marked silent', async () => {
    const client = createQueryClient(false);
    const mutation = (silent: boolean) =>
      client.getMutationCache().build(client, {
        mutationFn: vi.fn().mockRejectedValue(new Error('Failed')),
        meta: { silent },
      });
    await expect(mutation(true).execute(undefined)).rejects.toThrow('Failed');
    expect(toasts.get()).toEqual([]);
    await expect(mutation(false).execute(undefined)).rejects.toThrow('Failed');
    expect(toasts.get()).toHaveLength(1);
    client.clear();
  });
});
