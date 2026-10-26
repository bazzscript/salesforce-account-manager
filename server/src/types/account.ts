/**
 * Public API shape for an Account.
 *
 * We deliberately translate Salesforce's `Id` / `Name` / `Industry` field
 * names into camelCase at the boundary. The browser never needs to know how
 * Salesforce names its fields, and the API stays pleasant to consume.
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

/** One Salesforce limit, normalised for the UI. */
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
