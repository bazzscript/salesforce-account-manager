import type { ApiErrorPayload, ValidationDetail } from '@/types/account';
import type { Account, AccountInput, AccountPatch, ApiLimits, HealthStatus } from '@/types/account';

/** Same-origin `/api` by default; Vite proxies it in development. */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ValidationDetail[];

  constructor(status: number, code: string, message: string, details: ValidationDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static fromResponse(status: number, payload: ApiErrorPayload | null): ApiError {
    const error = payload?.error;
    const details = Array.isArray(error?.details)
      ? error.details.flatMap((detail: unknown) => {
          if (
            typeof detail === 'object' &&
            detail !== null &&
            'field' in detail &&
            'message' in detail &&
            typeof detail.field === 'string' &&
            typeof detail.message === 'string'
          ) {
            return [{ field: detail.field, message: detail.message }];
          }
          return [];
        })
      : [];

    return new ApiError(
      status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `The API returned an unexpected ${status} response.`,
      details,
    );
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the API server. Check that it is running and try again.',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const payload: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw ApiError.fromResponse(response.status, payload as ApiErrorPayload | null);
  }

  return payload as T;
}

export const accountsApi = {
  list(): Promise<Account[]> {
    return apiRequest<Account[]>('/accounts');
  },
  create(input: AccountInput): Promise<Account> {
    return apiRequest<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id: string, patch: AccountPatch): Promise<Account> {
    return apiRequest<Account>(`/accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  remove(id: string): Promise<void> {
    return apiRequest<void>(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  limits(): Promise<ApiLimits> {
    return apiRequest<ApiLimits>('/limits');
  },
  health(): Promise<HealthStatus> {
    return apiRequest<HealthStatus>('/health');
  },
};
