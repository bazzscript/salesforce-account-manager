import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../types/account';

vi.mock('../api/accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounts')>();
  return {
    ...actual,
    accountsApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      limits: vi.fn(),
      health: vi.fn(),
    },
  };
});

import { accountsApi, ApiError } from '../api/accounts';
import { useAccountsStore } from './accounts';

const listMock = vi.mocked(accountsApi.list);
const createMock = vi.mocked(accountsApi.create);
const updateMock = vi.mocked(accountsApi.update);
const removeMock = vi.mocked(accountsApi.remove);

const acme: Account = { id: '001A', name: 'Acme Logistics', industry: 'Transportation' };
const globex: Account = { id: '001B', name: 'Globex', industry: null };
const initech: Account = { id: '001C', name: 'Initech', industry: 'Technology' };

describe('accounts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads accounts and records the sync time', async () => {
    listMock.mockResolvedValue([acme, globex, initech]);
    const store = useAccountsStore();

    await store.load();

    expect(store.items).toHaveLength(3);
    expect(store.total).toBe(3);
    expect(store.hasLoadedOnce).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.lastSyncedAt).toBeInstanceOf(Date);
    expect(store.errorMessage).toBeNull();
  });

  it('captures load failures without pretending the list loaded', async () => {
    listMock.mockRejectedValue(new ApiError(503, 'SALESFORCE_UNAVAILABLE', 'Salesforce is down.'));
    const store = useAccountsStore();

    await store.load();

    expect(store.items).toEqual([]);
    expect(store.hasLoadedOnce).toBe(false);
    expect(store.loading).toBe(false);
    expect(store.errorMessage).toBe('Salesforce is down.');
  });

  it('filters by name and industry, case-insensitively', async () => {
    listMock.mockResolvedValue([acme, globex, initech]);
    const store = useAccountsStore();
    await store.load();

    store.search = 'TECH';
    expect(store.isSearching).toBe(true);
    expect(store.filteredAccounts).toEqual([initech]);

    store.search = '  acme ';
    expect(store.filteredAccounts).toEqual([acme]);

    store.search = 'nope';
    expect(store.filteredAccounts).toEqual([]);

    store.search = '';
    expect(store.isSearching).toBe(false);
    expect(store.filteredAccounts).toHaveLength(3);
  });

  it('offers unique, sorted industries that exist in the list', async () => {
    listMock.mockResolvedValue([
      acme,
      globex,
      initech,
      { id: '001D', name: 'Umbrella', industry: 'Technology' },
    ]);
    const store = useAccountsStore();
    await store.load();

    expect(store.industryOptions).toEqual(['Technology', 'Transportation']);
  });

  it('prepends a created account', async () => {
    listMock.mockResolvedValue([acme]);
    const created: Account = { id: '001E', name: 'Hooli', industry: 'Technology' };
    createMock.mockResolvedValue(created);
    const store = useAccountsStore();
    await store.load();

    const result = await store.create({ name: 'Hooli', industry: 'Technology' });

    expect(result).toEqual(created);
    expect(store.items[0]).toEqual(created);
    expect(store.total).toBe(2);
    expect(store.saving).toBe(false);
  });

  it('replaces an updated account without reordering the list', async () => {
    listMock.mockResolvedValue([acme, globex]);
    const renamed: Account = { ...acme, name: 'Acme Freight' };
    updateMock.mockResolvedValue(renamed);
    const store = useAccountsStore();
    await store.load();

    await store.update('001A', { name: 'Acme Freight' });

    expect(store.items.map((account) => account.name)).toEqual(['Acme Freight', 'Globex']);
  });

  it('surfaces validation details and rethrows on create', async () => {
    listMock.mockResolvedValue([]);
    const failure = new ApiError(400, 'VALIDATION_ERROR', 'The request contains invalid fields.', [
      { field: 'name', message: 'Name is required.' },
    ]);
    createMock.mockRejectedValue(failure);
    const store = useAccountsStore();
    await store.load();

    await expect(store.create({ name: '', industry: null })).rejects.toBe(failure);

    expect(store.saving).toBe(false);
    expect(store.errorMessage).toBe('The request contains invalid fields.');
    expect(store.errorDetails).toEqual([{ field: 'name', message: 'Name is required.' }]);
  });

  it('removes an account and clears the deleting flag', async () => {
    listMock.mockResolvedValue([acme, globex]);
    removeMock.mockResolvedValue(undefined);
    const store = useAccountsStore();
    await store.load();

    await store.remove('001A');

    expect(store.items).toEqual([globex]);
    expect(store.deletingId).toBeNull();
  });

  it('keeps the account when a delete fails', async () => {
    listMock.mockResolvedValue([acme]);
    removeMock.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Account not found.'));
    const store = useAccountsStore();
    await store.load();

    await expect(store.remove('001A')).rejects.toBeInstanceOf(ApiError);

    expect(store.items).toEqual([acme]);
    expect(store.deletingId).toBeNull();
    expect(store.errorMessage).toBe('Account not found.');
  });

  it('clears captured errors on demand', async () => {
    listMock.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Unexpected server error.'));
    const store = useAccountsStore();
    await store.load();

    expect(store.errorMessage).not.toBeNull();
    store.clearError();

    expect(store.errorMessage).toBeNull();
    expect(store.errorDetails).toEqual([]);
  });
});
