import type { Account, AccountPatch, ApiLimits } from '../types/account.js';
import type { AppServices } from '../types/services.js';
import { HttpError } from '../errors/httpError.js';

/**
 * Optional demo mode (`SF_MOCK=true`) so the UI can be explored without a
 * Salesforce org. It implements the same service interfaces as the real
 * gateway, which keeps the routes and the Pinia store completely unaware of
 * where the data comes from.
 *
 * This file is only ever wired up when SF_MOCK=true, and the env schema
 * refuses to start in production with that flag set.
 */

interface MockRecord extends Account {
  updatedAt: number;
}

const MOCK_DAILY_API_LIMIT = 15_000;
const MOCK_STORAGE_MB = 1_024;

const SEED_ACCOUNTS: ReadonlyArray<{ name: string; industry: string }> = [
  { name: 'Acme Logistics', industry: 'Transportation' },
  { name: 'Brightwave Analytics', industry: 'Technology' },
  { name: 'Cobalt Manufacturing', industry: 'Manufacturing' },
  { name: 'Harbor Point Health', industry: 'Healthcare' },
  { name: 'Meridian Renewables', industry: 'Energy' },
  { name: 'Northwind Traders', industry: 'Retail' },
  { name: 'Orchard & Vine', industry: 'Hospitality' },
  { name: 'Pinnacle Robotics', industry: 'Engineering' },
];

function mockId(): string {
  // 18 alphanumeric characters, the same shape as a Salesforce record id.
  const random = Math.random().toString(36).slice(2).toUpperCase().padEnd(15, '0');
  return `001${random.slice(0, 15)}`;
}

function wait(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAccount(record: MockRecord): Account {
  return { id: record.id, name: record.name, industry: record.industry };
}

export function createMockServices(): AppServices {
  let apiCalls = 0;

  const records: MockRecord[] = SEED_ACCOUNTS.map((seed, index) => ({
    id: mockId(),
    name: seed.name,
    industry: seed.industry,
    updatedAt: Date.now() - index * 60_000,
  }));

  const recordCall = (): void => {
    apiCalls += 1;
    if (apiCalls > MOCK_DAILY_API_LIMIT) {
      throw new HttpError(
        429,
        'SALESFORCE_LIMIT_EXCEEDED',
        'The demo org’s daily Salesforce API limit has been reached.',
      );
    }
  };

  const requireRecord = (id: string): MockRecord => {
    const record = records.find((entry) => entry.id === id);
    if (!record) {
      throw new HttpError(
        404,
        'ACCOUNT_NOT_FOUND',
        'That account no longer exists in Salesforce. Refresh the list and try again.',
      );
    }
    return record;
  };

  const assertNameIsUnique = (name: string, exceptId?: string): void => {
    const clash = records.some(
      (entry) => entry.id !== exceptId && entry.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      throw new HttpError(
        409,
        'DUPLICATE_ACCOUNT',
        'An account with that name already exists in Salesforce.',
      );
    }
  };

  const storageUsed = { value: 214 };

  return {
    accounts: {
      async list() {
        await wait();
        recordCall();
        return [...records]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map(toAccount);
      },

      async create(input) {
        await wait();
        recordCall();
        assertNameIsUnique(input.name);

        const record: MockRecord = {
          id: mockId(),
          name: input.name,
          industry: input.industry,
          updatedAt: Date.now(),
        };
        records.push(record);
        return toAccount(record);
      },

      async update(id: string, patch: AccountPatch) {
        await wait();
        recordCall();
        const record = requireRecord(id);

        if (patch.name !== undefined) {
          assertNameIsUnique(patch.name, id);
          record.name = patch.name;
        }
        if (patch.industry !== undefined) {
          record.industry = patch.industry;
        }
        record.updatedAt = Date.now();
        return toAccount(record);
      },

      async remove(id: string) {
        await wait();
        recordCall();
        const record = requireRecord(id);
        records.splice(records.indexOf(record), 1);
      },
    },

    limits: {
      async get(): Promise<ApiLimits> {
        await wait(60);
        recordCall();
        storageUsed.value = Math.min(storageUsed.value + 1, MOCK_STORAGE_MB);

        return {
          dailyApiRequests: {
            max: MOCK_DAILY_API_LIMIT,
            remaining: Math.max(MOCK_DAILY_API_LIMIT - apiCalls, 0),
            used: apiCalls,
          },
          dataStorageMb: {
            max: MOCK_STORAGE_MB,
            remaining: Math.max(MOCK_STORAGE_MB - storageUsed.value, 0),
            used: storageUsed.value,
          },
          fileStorageMb: {
            max: 512,
            remaining: 497,
            used: 15,
          },
          fetchedAt: new Date().toISOString(),
        };
      },
    },
  };
}
