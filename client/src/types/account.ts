/**
 * The client mirrors the server's camelCased API contract rather than
 * Salesforce's `Id` / `Name` / `Industry` field names.
 */
export interface Account {
  id: string;
  name: string;
  industry: string | null;
}

export interface AccountInput {
  name: string;
  industry: string | null;
}

export type AccountPatch = Partial<AccountInput>;

export interface ApiLimit {
  max: number;
  remaining: number;
  used: number;
}

export interface ApiLimits {
  dailyApiRequests: ApiLimit;
  dataStorageMb: ApiLimit;
  fileStorageMb: ApiLimit;
  fetchedAt: string;
}

export interface HealthStatus {
  status: 'ok';
  mode: 'live' | 'mock';
  salesforceApiVersion: string;
  uptimeSeconds: number;
}

export interface ValidationDetail {
  field: string;
  message: string;
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}
