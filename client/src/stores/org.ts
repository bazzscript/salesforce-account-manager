import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { accountsApi, ApiError } from '../api/accounts';
import type { ApiLimits } from '../types/account';

/**
 * Org-level telemetry: the daily API allowance and which mode the server is
 * in. These are deliberately separate from the accounts store so a limits
 * failure never blocks the account list.
 */
export const useOrgStore = defineStore('org', () => {
  const limits = ref<ApiLimits | null>(null);
  const loading = ref(false);
  const errorMessage = ref<string | null>(null);
  const mode = ref<'live' | 'mock' | null>(null);
  const apiVersion = ref<string | null>(null);

  const dailyPercent = computed(() => {
    if (!limits.value || limits.value.dailyApiRequests.max <= 0) return 0;
    const used = limits.value.dailyApiRequests.used;
    return Math.min(100, Math.max(0, Math.round((used / limits.value.dailyApiRequests.max) * 100)));
  });

  const isMock = computed(() => mode.value === 'mock');

  async function load(): Promise<void> {
    loading.value = true;
    errorMessage.value = null;

    // Health and limits are independent: one failing should not hide the
    // other. allSettled keeps both requests going in parallel.
    const [limitsResult, healthResult] = await Promise.allSettled([
      accountsApi.limits(),
      accountsApi.health(),
    ]);

    if (limitsResult.status === 'fulfilled') {
      limits.value = limitsResult.value;
    } else {
      const error = limitsResult.reason;
      errorMessage.value =
        error instanceof ApiError
          ? error.message
          : 'Could not read the Salesforce API limits.';
    }

    if (healthResult.status === 'fulfilled') {
      mode.value = healthResult.value.mode;
      apiVersion.value = healthResult.value.salesforceApiVersion;
    }

    loading.value = false;
  }

  return {
    limits,
    loading,
    errorMessage,
    mode,
    apiVersion,
    dailyPercent,
    isMock,
    load,
  };
});
