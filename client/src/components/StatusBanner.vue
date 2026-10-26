<script setup lang="ts">
import type { ValidationDetail } from '@/types/account';

defineProps<{
  message: string;
  details?: ValidationDetail[];
  retryable?: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  dismiss: [];
}>();
</script>

<template>
  <div class="status" role="alert">
    <span class="status__icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none">
        <path
          d="M10 6.5v4.2M10 14h.01"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.4" />
      </svg>
    </span>

    <div class="status__body">
      <p class="status__message">{{ message }}</p>
      <ul v-if="details && details.length" class="status__details">
        <li v-for="detail in details" :key="`${detail.field}-${detail.message}`">
          {{ detail.message }}
        </li>
      </ul>
    </div>

    <div class="status__actions">
      <button
        v-if="retryable"
        type="button"
        class="button button--small button--quiet"
        @click="emit('retry')"
      >
        Retry
      </button>
      <button
        type="button"
        class="status__dismiss"
        aria-label="Dismiss message"
        @click="emit('dismiss')"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="m4 4 8 8M12 4l-8 8"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.status {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid #f3c4c4;
  border-left: 3px solid var(--danger);
  border-radius: 0.55rem;
  background: #fff6f5;
  color: #7a1f1f;
}

.status__icon {
  flex: none;
  margin-top: 0.1rem;
  color: var(--danger);
}

.status__icon svg {
  width: 1.1rem;
  height: 1.1rem;
}

.status__body {
  flex: 1;
  min-width: 0;
}

.status__message {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 500;
  line-height: 1.5;
}

.status__details {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #9a3b3b;
}

.status__actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: none;
}

.status__dismiss {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: #a55a5a;
  cursor: pointer;
}

.status__dismiss:hover {
  background: #fbe3e1;
  color: #7a1f1f;
}

.status__dismiss svg {
  width: 0.85rem;
  height: 0.85rem;
}
</style>
