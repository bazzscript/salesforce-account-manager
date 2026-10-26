<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Account, AccountInput } from '@/types/account';

const props = defineProps<{
  account: Account | null;
  busy: boolean;
  serverError: string | null;
  suggestedIndustries: string[];
}>();

const emit = defineEmits<{
  submit: [input: AccountInput];
  close: [];
}>();

const name = ref(props.account?.name ?? '');
const industry = ref(props.account?.industry ?? '');
const nameError = ref<string | null>(null);
const industryError = ref<string | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);

const isEditing = computed(() => props.account !== null);

function requestClose(): void {
  if (!props.busy) emit('close');
}

function submit(): void {
  const trimmedName = name.value.trim();
  const trimmedIndustry = industry.value.trim();

  nameError.value = null;
  industryError.value = null;

  if (trimmedName.length === 0) {
    nameError.value = 'Name is required.';
  } else if (trimmedName.length > 255) {
    nameError.value = 'Keep the name under 255 characters.';
  }

  if (trimmedIndustry.length > 255) {
    industryError.value = 'Keep the industry under 255 characters.';
  }

  if (nameError.value || industryError.value) {
    if (nameError.value) nameInput.value?.focus();
    return;
  }

  emit('submit', {
    name: trimmedName,
    industry: trimmedIndustry.length === 0 ? null : trimmedIndustry,
  });
}

function focusableElements(): HTMLElement[] {
  if (!dialog.value) return [];
  return Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/** Keep Tab inside the dialog and let Escape close it. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose();
    return;
  }

  if (event.key !== 'Tab') return;

  const items = focusableElements();
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;

  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !dialog.value?.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.body.classList.add('modal-open');
  nameInput.value?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.classList.remove('modal-open');
});
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown.self="requestClose">
      <div
        ref="dialog"
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-form-title"
      >
        <header class="modal__head">
          <div>
            <p class="modal__eyebrow">{{ isEditing ? 'Edit record' : 'New record' }}</p>
            <h2 id="account-form-title" class="modal__title">
              {{ isEditing ? account?.name : 'Add an account' }}
            </h2>
          </div>

          <button
            type="button"
            class="modal__close"
            aria-label="Close dialog"
            :disabled="busy"
            @click="requestClose"
          >
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="m4.5 4.5 9 9M13.5 4.5l-9 9"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>

        <form class="form" novalidate @submit.prevent="submit">
          <div class="field">
            <label class="field__label" for="account-name">
              Account name
              <span class="field__required" aria-hidden="true">*</span>
            </label>
            <input
              id="account-name"
              ref="nameInput"
              v-model="name"
              type="text"
              class="field__input"
              :class="{ 'field__input--invalid': nameError }"
              maxlength="255"
              placeholder="e.g. Northwind Traders"
              autocomplete="off"
              :aria-invalid="nameError !== null"
              :aria-describedby="nameError ? 'account-name-error' : 'account-name-hint'"
            />
            <p v-if="nameError" id="account-name-error" class="field__error">
              {{ nameError }}
            </p>
            <p v-else id="account-name-hint" class="field__hint">
              Required. This is the <code>Name</code> field on the Salesforce Account object.
            </p>
          </div>

          <div class="field">
            <label class="field__label" for="account-industry">
              Industry
              <span class="field__optional">Optional</span>
            </label>
            <input
              id="account-industry"
              v-model="industry"
              type="text"
              class="field__input"
              :class="{ 'field__input--invalid': industryError }"
              maxlength="255"
              placeholder="e.g. Manufacturing"
              list="industry-suggestions"
              autocomplete="off"
              :aria-invalid="industryError !== null"
              :aria-describedby="industryError ? 'account-industry-error' : 'account-industry-hint'"
            />
            <datalist id="industry-suggestions">
              <option v-for="option in suggestedIndustries" :key="option" :value="option" />
            </datalist>
            <p v-if="industryError" id="account-industry-error" class="field__error">
              {{ industryError }}
            </p>
            <p v-else id="account-industry-hint" class="field__hint">
              Free text. Suggestions come from industries already in this list.
            </p>
          </div>

          <p v-if="serverError" class="form__error" role="alert">{{ serverError }}</p>

          <footer class="modal__footer">
            <p class="modal__note">
              {{ isEditing ? 'Saved to Salesforce on submit.' : 'Created directly in Salesforce.' }}
            </p>
            <div class="modal__buttons">
              <button
                type="button"
                class="button button--quiet"
                :disabled="busy"
                @click="requestClose"
              >
                Cancel
              </button>
              <button type="submit" class="button button--primary" :disabled="busy">
                <span v-if="busy" class="spinner" aria-hidden="true" />
                {{ busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create account' }}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgb(5 18 30 / 58%);
  backdrop-filter: blur(3px);
  animation: fade 140ms ease-out;
}

.modal {
  width: min(30rem, 100%);
  max-height: calc(100vh - 3rem);
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: var(--surface);
  box-shadow: 0 28px 60px rgb(3 20 35 / 28%);
  animation: rise 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

.modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.35rem 1.5rem 1.1rem;
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(120% 160% at 0% -40%, rgb(1 118 211 / 9%), transparent 65%),
    var(--surface);
}

.modal__eyebrow {
  margin: 0 0 0.2rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sf-blue);
}

.modal__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 550;
  letter-spacing: -0.01em;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.modal__close {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.9rem;
  height: 1.9rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.modal__close:hover {
  background: var(--surface-alt);
  border-color: var(--line);
  color: var(--ink);
}

.modal__close svg {
  width: 1rem;
  height: 1rem;
}

.form {
  padding: 1.35rem 1.5rem 1.5rem;
}

.field {
  margin-bottom: 1.1rem;
}

.field__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--ink);
}

.field__required {
  color: var(--danger);
}

.field__optional {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-soft);
}

.field__input {
  width: 100%;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.92rem;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.field__input::placeholder {
  color: var(--muted-soft);
}

.field__input:focus {
  outline: none;
  border-color: var(--sf-blue);
  box-shadow: 0 0 0 3px rgb(1 118 211 / 14%);
}

.field__input--invalid {
  border-color: var(--danger);
}

.field__input--invalid:focus {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px rgb(185 28 28 / 12%);
}

.field__hint,
.field__error {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
}

.field__hint {
  color: var(--muted);
}

.field__hint code {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  background: var(--surface-alt);
  border: 1px solid var(--line);
}

.field__error {
  color: var(--danger);
  font-weight: 500;
}

.form__error {
  margin: 0 0 1rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid #f3c4c4;
  border-radius: 0.45rem;
  background: #fff6f5;
  color: #7a1f1f;
  font-size: 0.8rem;
  line-height: 1.5;
}

.modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-top: 1.5rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--line);
}

.modal__note {
  margin: 0;
  max-width: 18ch;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1.5;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted-soft);
}

.modal__buttons {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
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

  .modal {
    max-height: calc(100vh - 1.5rem);
  }

  .modal__head {
    padding: 1.1rem 1.15rem 0.9rem;
  }

  .form {
    padding: 1.1rem 1.15rem 1.2rem;
  }

  .modal__footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .modal__buttons {
    justify-content: flex-end;
  }
}
</style>

