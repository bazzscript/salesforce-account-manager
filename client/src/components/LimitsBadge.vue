<script setup lang="ts">
import { computed } from 'vue';
import type { ApiLimits } from '@/types/account';
import { formatNumber } from '@/utils/format';

const props = defineProps<{
  limits: ApiLimits | null;
  loading: boolean;
}>();

const percent = computed(() => {
  if (!props.limits || props.limits.dailyApiRequests.max <= 0) return 0;
  return Math.min(
    100,
    Math.round(
      (props.limits.dailyApiRequests.used / props.limits.dailyApiRequests.max) * 100,
    ),
  );
});

const tone = computed(() => {
  if (percent.value >= 85) return 'critical';
  if (percent.value >= 60) return 'warn';
  return 'ok';
});

const label = computed(() => {
  if (!props.limits) return props.loading ? 'Syncing API usage' : 'API usage unavailable';

  const requests = props.limits.dailyApiRequests;
  return `Daily API requests: ${formatNumber(requests.used)} of ${formatNumber(requests.max)} used (${percent.value}%), ${formatNumber(requests.remaining)} remaining.`;
});
</script>

<template>
  <div
    class="limits"
    :class="`limits--${tone}`"
    role="status"
    aria-live="polite"
    :title="label"
  >
    <span class="limits__label">
      <span class="limits__dot" aria-hidden="true" />
      API calls
    </span>

    <span v-if="limits" class="limits__value">
      {{ formatNumber(limits.dailyApiRequests.used) }}
      <span class="limits__max">/ {{ formatNumber(limits.dailyApiRequests.max) }}</span>
    </span>
    <span v-else-if="loading" class="limits__value limits__value--muted">syncing…</span>
    <span v-else class="limits__value limits__value--muted">unavailable</span>

    <span v-if="limits" class="limits__track" aria-hidden="true">
      <span class="limits__fill" :style="{ width: `${percent}%` }" />
    </span>
  </div>
</template>

<style scoped>
.limits {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 0.1rem 0.75rem;
  min-width: 12.5rem;
  padding: 0.5rem 0.85rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0.6rem;
  background: rgb(255 255 255 / 5%);
}

.limits__label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(226 238 250 / 62%);
}

.limits__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--tone);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone) 22%, transparent);
}

.limits__value {
  justify-self: end;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: #eff6ff;
  font-variant-numeric: tabular-nums;
}

.limits__value--muted {
  color: rgb(226 238 250 / 45%);
}

.limits__max {
  color: rgb(226 238 250 / 45%);
}

.limits__track {
  grid-column: 1 / -1;
  height: 2px;
  border-radius: 999px;
  background: rgb(255 255 255 / 12%);
  overflow: hidden;
}

.limits__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--tone);
  transition: width 400ms ease;
}

.limits--ok {
  --tone: #5eead4;
}

.limits--warn {
  --tone: #fbbf24;
}

.limits--critical {
  --tone: #fb7185;
}

@media (max-width: 720px) {
  .limits {
    min-width: 0;
    width: 100%;
  }
}
</style>
