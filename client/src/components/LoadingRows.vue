<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 5 });
</script>

<template>
  <div class="skeleton" role="status" aria-live="polite" aria-label="Loading accounts">
    <div v-for="row in rows" :key="row" class="skeleton__row">
      <span class="skeleton__avatar shimmer" />
      <span class="skeleton__name shimmer" :style="{ width: `${45 + ((row * 13) % 30)}%` }" />
      <span class="skeleton__pill shimmer" />
      <span class="skeleton__id shimmer" />
    </div>
    <span class="sr-only">Loading accounts from Salesforce…</span>
  </div>
</template>

<style scoped>
.skeleton {
  border: 1px solid var(--line);
  border-radius: 0.85rem;
  background: var(--surface);
  overflow: hidden;
}

.skeleton__row {
  display: grid;
  grid-template-columns: 2.2rem minmax(6rem, 1fr) 7rem 10rem;
  align-items: center;
  gap: 1rem;
  padding: 1.05rem 1.25rem;
  border-bottom: 1px solid var(--row-line);
}

.skeleton__row:last-child {
  border-bottom: 0;
}

.skeleton__avatar {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
}

.skeleton__name {
  height: 0.75rem;
  border-radius: 999px;
}

.skeleton__pill {
  height: 1.2rem;
  border-radius: 999px;
}

.skeleton__id {
  height: 0.7rem;
  border-radius: 999px;
}

@media (max-width: 760px) {
  .skeleton__row {
    grid-template-columns: 2.2rem 1fr;
  }

  .skeleton__pill,
  .skeleton__id {
    display: none;
  }
}
</style>
