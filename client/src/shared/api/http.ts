import type { ErrorResponse, FieldError } from '@todo/contracts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldError[];

  constructor(status: number, code: string, message: string, details: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map(({ path, message }) => [path, message]));
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}

interface HttpClientOptions {
  baseUrl?: string;
  getToken: () => string | undefined;
  onUnauthorized?: (token: string) => void;
  timeoutMs?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readError = (payload: unknown): Partial<ErrorResponse['error']> => {
  if (!isRecord(payload) || !isRecord(payload.error)) return {};
  const { code, message, details } = payload.error;
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
    details: Array.isArray(details)
      ? details.filter(
          (item): item is FieldError =>
            isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string',
        )
      : undefined,
  };
};

export const createHttpClient = ({
  baseUrl = '',
  getToken,
  onUnauthorized,
  timeoutMs = 30_000,
}: HttpClientOptions) => {
  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    { signal }: RequestOptions = {},
  ): Promise<T> => {
    const token = getToken();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 204) return undefined as T;
      const payload: unknown = await response.json().catch(() => {
        if (response.ok)
          throw new ApiError(
            response.status,
            'INVALID_RESPONSE',
            'The server returned an unreadable response. Please try again.',
          );
        return null;
      });
      if (response.ok) return payload as T;
      if (response.status === 401 && token) onUnauthorized?.(token);
      const error = readError(payload);
      throw new ApiError(
        response.status,
        error.code ?? 'UNKNOWN',
        error.message ?? `Request failed (${response.status})`,
        error.details,
      );
    } catch (error) {
      if (timedOut)
        throw new ApiError(0, 'TIMEOUT', 'The request took too long. Please try again.');
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  };

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body: unknown, options?: RequestOptions) =>
      request<T>('POST', path, body, options),
    put: <T>(path: string, body: unknown, options?: RequestOptions) =>
      request<T>('PUT', path, body, options),
    patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
      request<T>('PATCH', path, body, options),
    delete: (path: string, options?: RequestOptions) =>
      request<void>('DELETE', path, undefined, options),
  };
};

export type HttpClient = ReturnType<typeof createHttpClient>;
