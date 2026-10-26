<script setup lang="ts">
defineProps<{
  isSearching: boolean;
  query: string;
}>();

const emit = defineEmits<{
  create: [];
  clearSearch: [];
}>();
</script>

<template>
  <div class="empty">
    <span class="empty__art" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <rect x="10" y="15" width="44" height="34" rx="5" stroke="currentColor" stroke-width="1.6" />
        <path d="M10 25h44" stroke="currentColor" stroke-width="1.6" />
        <path
          d="M19 34h11M19 40h18"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <circle cx="45" cy="44" r="8" fill="var(--surface)" stroke="currentColor" stroke-width="1.6" />
        <path
          d="M42 44h6M45 41v6"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </span>

    <template v-if="isSearching">
      <h2 class="empty__title">No matches for “{{ query }}”</h2>
      <p class="empty__copy">
        Search covers account names and industries. Try a shorter term, or clear the filter to
        see all {{ 'accounts' }}.
      </p>
      <button type="button" class="button button--quiet" @click="emit('clearSearch')">
        Clear search
      </button>
    </template>

    <template v-else>
      <h2 class="empty__title">Your org has no accounts yet</h2>
      <p class="empty__copy">
        Create the first one — it will be written straight to Salesforce and appear here.
      </p>
      <button type="button" class="button button--primary" @click="emit('create')">
        Create an account
      </button>
    </template>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3.5rem 1.5rem 4rem;
  border: 1px dashed var(--line-strong);
  border-radius: 0.85rem;
  background:
    radial-gradient(90% 140% at 50% -20%, rgb(1 118 211 / 6%), transparent 70%),
    var(--surface);
}

.empty__art {
  display: grid;
  place-items: center;
  width: 4.25rem;
  height: 4.25rem;
  margin-bottom: 1.1rem;
  border-radius: 1rem;
  border: 1px solid var(--line);
  background: var(--surface-alt);
  color: var(--sf-blue);
}

.empty__art svg {
  width: 3rem;
  height: 3rem;
}

.empty__title {
  margin: 0 0 0.4rem;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 550;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.empty__copy {
  max-width: 34ch;
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--muted);
}
</style>
