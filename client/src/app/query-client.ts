import { MutationCache, QueryClient, type QueryClientConfig } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { notify } from '@/shared/lib/toast';

type RetryOption = NonNullable<
  NonNullable<QueryClientConfig['defaultOptions']>['queries']
>['retry'];

const MAX_RETRIES = 2;

/** Client errors (4xx) are deterministic, so only network/server failures are retried. */
const retryTransientErrors = (failureCount: number, error: Error) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
  failureCount < MAX_RETRIES;

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

export const createQueryClient = (retry: RetryOption = retryTransientErrors) =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry },
      mutations: { retry: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.meta?.silent) notify(error.message);
      },
    }),
  });
