import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { accountsApi, ApiError } from '../api/accounts';
import type { Account, AccountInput, AccountPatch, ValidationDetail } from '../types/account';

export const useAccountsStore = defineStore('accounts', () => {
  const items = ref<Account[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const deletingId = ref<string | null>(null);
  const errorMessage = ref<string | null>(null);
  const errorDetails = ref<ValidationDetail[]>([]);
  const search = ref('');
  const lastSyncedAt = ref<Date | null>(null);
  const hasLoadedOnce = ref(false);

  const filteredAccounts = computed(() => {
    const query = search.value.trim().toLowerCase();
    if (!query) return items.value;

    return items.value.filter((account) => {
      return (
        account.name.toLowerCase().includes(query) ||
        (account.industry ?? '').toLowerCase().includes(query)
      );
    });
  });

  const total = computed(() => items.value.length);
  const isSearching = computed(() => search.value.trim().length > 0);

  /** Industries already present in the list, offered as datalist suggestions. */
  const industryOptions = computed(() => {
    const values = items.value
      .map((account) => account.industry)
      .filter((industry): industry is string => Boolean(industry));
    return [...new Set(values)].sort((a, b) => a.localeCompare(b)).slice(0, 12);
  });

  function captureError(error: unknown): string {
    const message =
      error instanceof ApiError
        ? error.message
        : 'Something went wrong while talking to the API. Please try again.';

    errorMessage.value = message;
    errorDetails.value = error instanceof ApiError ? error.details : [];
    return message;
  }

  function clearError(): void {
    errorMessage.value = null;
    errorDetails.value = [];
  }

  async function load(): Promise<void> {
    loading.value = true;
    clearError();

    try {
      items.value = await accountsApi.list();
      lastSyncedAt.value = new Date();
      hasLoadedOnce.value = true;
    } catch (error) {
      captureError(error);
    } finally {
      loading.value = false;
    }
  }

  async function create(input: AccountInput): Promise<Account> {
    saving.value = true;
    clearError();

    try {
      const created = await accountsApi.create(input);
      // The API lists by LastModifiedDate DESC, so a new record belongs on top.
      items.value = [created, ...items.value];
      lastSyncedAt.value = new Date();
      return created;
    } catch (error) {
      captureError(error);
      throw error;
    } finally {
      saving.value = false;
    }
  }

  async function update(id: string, patch: AccountPatch): Promise<Account> {
    saving.value = true;
    clearError();

    try {
      const updated = await accountsApi.update(id, patch);
      // Replace in place: reordering mid-edit would be disorienting.
      items.value = items.value.map((account) => (account.id === id ? updated : account));
      lastSyncedAt.value = new Date();
      return updated;
    } catch (error) {
      captureError(error);
      throw error;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string): Promise<void> {
    deletingId.value = id;
    clearError();

    try {
      await accountsApi.remove(id);
      items.value = items.value.filter((account) => account.id !== id);
    } catch (error) {
      captureError(error);
      throw error;
    } finally {
      deletingId.value = null;
    }
  }

  return {
    items,
    loading,
    saving,
    deletingId,
    errorMessage,
    errorDetails,
    search,
    lastSyncedAt,
    hasLoadedOnce,
    filteredAccounts,
    total,
    isSearching,
    industryOptions,
    clearError,
    load,
    create,
    update,
    remove,
  };
});
