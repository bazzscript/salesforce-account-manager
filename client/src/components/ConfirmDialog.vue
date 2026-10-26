<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Account } from '@/types/account';

const props = defineProps<{
  account: Account;
  busy: boolean;
  errorMessage: string | null;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const cancelButton = ref<HTMLButtonElement | null>(null);
const dialog = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !props.busy) {
    event.preventDefault();
    emit('cancel');
    return;
  }

  if (event.key !== 'Tab' || !dialog.value) return;

  const items = Array.from(
    dialog.value.querySelectorAll<HTMLElement>('button:not([disabled])'),
  );
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.body.classList.add('modal-open');
  // Focus the safe action, not the destructive one.
  cancelButton.value?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.classList.remove('modal-open');
});
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown.self="!busy && emit('cancel')">
      <div
        ref="dialog"
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-copy"
      >
        <span class="dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8.5v4.2M12 16h.01"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
          </svg>
        </span>

        <h2 id="delete-title" class="dialog__title">Delete this account?</h2>
        <p id="delete-copy" class="dialog__copy">
          <strong>{{ account.name }}</strong> will be removed from Salesforce. This cannot be
          undone from this app.
        </p>
        <p class="dialog__id">ID {{ account.id }}</p>

        <p v-if="errorMessage" class="dialog__error" role="alert">{{ errorMessage }}</p>

        <div class="dialog__buttons">
          <button
            ref="cancelButton"
            type="button"
            class="button button--quiet"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Keep account
          </button>
          <button type="button" class="button button--danger" :disabled="busy" @click="emit('confirm')">
            <span v-if="busy" class="spinner" aria-hidden="true" />
            {{ busy ? 'Deleting…' : 'Delete account' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgb(5 18 30 / 58%);
  backdrop-filter: blur(3px);
  animation: fade 140ms ease-out;
}

.dialog {
  width: min(24rem, 100%);
  padding: 1.5rem;
  border: 1px solid var(--line);
  border-top: 3px solid var(--danger);
  border-radius: 0.85rem;
  background: var(--surface);
  box-shadow: 0 28px 60px rgb(3 20 35 / 28%);
  animation: rise 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

.dialog__icon {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  margin-bottom: 0.9rem;
  border-radius: 0.6rem;
  background: #fff1f0;
  border: 1px solid #f7d4d1;
  color: var(--danger);
}

.dialog__icon svg {
  width: 1.5rem;
  height: 1.5rem;
}

.dialog__title {
  margin: 0 0 0.45rem;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 550;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.dialog__copy {
  margin: 0 0 0.65rem;
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--muted);
}

.dialog__copy strong {
  color: var(--ink);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.dialog__id {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  color: var(--muted-soft);
  word-break: break-all;
}

.dialog__error {
  margin: 0.85rem 0 0;
  padding: 0.55rem 0.7rem;
  border: 1px solid #f3c4c4;
  border-radius: 0.4rem;
  background: #fff6f5;
  color: #7a1f1f;
  font-size: 0.78rem;
  line-height: 1.5;
}

.dialog__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.35rem;
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
}

@media (max-width: 480px) {
  .overlay {
    padding: 0.75rem;
    align-items: end;
  }

  .dialog__buttons {
    flex-direction: column-reverse;
  }

  .dialog__buttons .button {
    justify-content: center;
    width: 100%;
  }
}
</style>
