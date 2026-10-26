import type {
  Account,
  AccountInput,
  AccountPatch,
  ApiLimits,
} from './account.js';

/**
 * The HTTP layer depends on these interfaces, not on jsforce.
 *
 * That inversion is what lets the route tests run with a fake service and
 * gives us one obvious seam for the optional in-memory demo mode.
 */
export interface AccountService {
  list(): Promise<Account[]>;
  create(input: AccountInput): Promise<Account>;
  update(id: string, patch: AccountPatch): Promise<Account>;
  remove(id: string): Promise<void>;
}

export interface LimitsService {
  get(): Promise<ApiLimits>;
}

export interface AppServices {
  accounts: AccountService;
  limits: LimitsService;
}
