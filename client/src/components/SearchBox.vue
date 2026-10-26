<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const input = ref<HTMLInputElement | null>(null);

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function clear(): void {
  emit('update:modelValue', '');
  input.value?.focus();
}

/** Press "/" anywhere (outside a field) to jump to search. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target as HTMLElement | null;
  const tag = target?.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
    return;
  }

  event.preventDefault();
  input.value?.focus();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="search">
    <svg class="search__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.25" stroke="currentColor" stroke-width="1.5" />
      <path d="m13 13 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <input
      ref="input"
      class="search__input"
      type="search"
      :value="props.modelValue"
      :placeholder="props.placeholder ?? 'Search name or industry'"
      aria-label="Search accounts by name or industry"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
    />

    <button
      v-if="props.modelValue"
      type="button"
      class="search__clear"
      aria-label="Clear search"
      @click="clear"
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
    <kbd v-else class="search__kbd" aria-hidden="true">/</kbd>
  </div>
</template>

<style scoped>
.search {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 16rem;
  flex: 1 1 18rem;
  max-width: 24rem;
}

.search__icon {
  position: absolute;
  left: 0.85rem;
  width: 1rem;
  height: 1rem;
  color: var(--muted);
  pointer-events: none;
}

.search__input {
  width: 100%;
  padding: 0.62rem 2.6rem 0.62rem 2.45rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.55rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.88rem;
  transition: border-color 150ms ease, box-shadow 150ms ease;
  appearance: none;
}

.search__input::placeholder {
  color: var(--muted-soft);
}

.search__input:focus {
  outline: none;
  border-color: var(--sf-blue);
  box-shadow: 0 0 0 3px rgb(1 118 211 / 14%);
}

.search__input::-webkit-search-cancel-button {
  display: none;
}

.search__clear {
  position: absolute;
  right: 0.55rem;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--surface-alt);
  color: var(--muted);
  cursor: pointer;
}

.search__clear:hover {
  background: var(--line);
  color: var(--ink);
}

.search__clear svg {
  width: 0.8rem;
  height: 0.8rem;
}

.search__kbd {
  position: absolute;
  right: 0.7rem;
  padding: 0.05rem 0.35rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.3rem;
  background: var(--surface-alt);
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  pointer-events: none;
}

@media (max-width: 640px) {
  .search {
    max-width: none;
    min-width: 0;
  }
}
</style>
