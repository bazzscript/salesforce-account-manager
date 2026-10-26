import { vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { Account, AccountInput, AccountPatch, ApiLimits } from '../src/types/account.js';
import type { AccountService, LimitsService } from '../src/types/services.js';

export const ACCOUNT_ID = '001000000000001AAA';
export const CREATED_ID = '001000000000002AAA';

export const account: Account = {
  id: ACCOUNT_ID,
  name: 'Acme Logistics',
  industry: 'Transportation',
};

export const limits: ApiLimits = {
  dailyApiRequests: { max: 15_000, remaining: 14_980, used: 20 },
  dataStorageMb: { max: 1_024, remaining: 810, used: 214 },
  fileStorageMb: { max: 512, remaining: 497, used: 15 },
  fetchedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * The app only depends on the AccountService / LimitsService interfaces, so
 * these tests never touch jsforce or the network. That is the point of the
 * dependency injection in createApp().
 */
export function harness(
  overrides: Partial<AccountService> = {},
  options: { clientDistPath?: string } = {},
) {
  const accounts: AccountService = {
    list: vi.fn(async () => [account]),
    create: vi.fn(async (input: AccountInput) => ({ id: CREATED_ID, ...input })),
    update: vi.fn(async (id: string, patch: AccountPatch) => ({ ...account, ...patch, id })),
    remove: vi.fn(async () => undefined),
  };
  Object.assign(accounts, overrides);

  const limitsService: LimitsService = {
    get: vi.fn(async () => limits),
  };

  const app = createApp({
    services: { accounts, limits: limitsService },
    corsOrigins: ['http://localhost:5173'],
    apiVersion: '62.0',
    mode: 'mock',
    clientDistPath: options.clientDistPath,
  });

  return { app, accounts, limitsService };
}
