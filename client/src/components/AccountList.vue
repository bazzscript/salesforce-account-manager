<script setup lang="ts">
import type { Account } from '@/types/account';
import { industryHue, initials } from '@/utils/format';

defineProps<{
  accounts: Account[];
  deletingId: string | null;
}>();

const emit = defineEmits<{
  edit: [account: Account];
  remove: [account: Account];
}>();

function hue(industry: string | null): Record<string, string> {
  return { '--hue': String(industryHue(industry)) };
}
</script>

<template>
  <div class="table-wrap">
    <table class="accounts">
      <caption class="sr-only">
        Salesforce accounts, most recently modified first
      </caption>
      <thead>
        <tr>
          <th scope="col">Account</th>
          <th scope="col">Industry</th>
          <th scope="col">Salesforce ID</th>
          <th scope="col" class="col-actions"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="account in accounts" :key="account.id" class="account-row">
          <td data-label="Account">
            <div class="identity">
              <span class="avatar" :style="hue(account.industry)" aria-hidden="true">
                {{ initials(account.name) }}
              </span>
              <span class="identity__name">{{ account.name }}</span>
            </div>
          </td>

          <td data-label="Industry">
            <span v-if="account.industry" class="pill" :style="hue(account.industry)">
              <span class="pill__dot" aria-hidden="true" />
              {{ account.industry }}
            </span>
            <span v-else class="unset">Not set</span>
          </td>

          <td data-label="Salesforce ID">
            <code class="id" :title="account.id">{{ account.id }}</code>
          </td>

          <td class="col-actions">
            <div class="actions">
              <button
                type="button"
                class="icon-button"
                :aria-label="`Edit ${account.name}`"
                @click="emit('edit', account)"
              >
                <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="m11.4 3.1 3.5 3.5M4 14l.6-3.2L12.9 2.5a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2l-8.3 8.3L4 14Z"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="icon-button__label">Edit</span>
              </button>

              <button
                type="button"
                class="icon-button icon-button--danger"
                :disabled="deletingId === account.id"
                :aria-label="`Delete ${account.name}`"
                @click="emit('remove', account)"
              >
                <svg
                  v-if="deletingId === account.id"
                  class="spin"
                  viewBox="0 0 18 18"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.6" opacity=".25" />
                  <path
                    d="M15 9a6 6 0 0 0-6-6"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                </svg>
                <svg v-else viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 5h11M7 5V3.6h4V5m-6 0 .6 9.1h6.8L13 5M7.6 7.8v4M10.4 7.8v4"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="icon-button__label">Delete</span>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  border: 1px solid var(--line);
  border-radius: 0.85rem;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.accounts {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.accounts th {
  padding: 0.7rem 1.25rem;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}

.accounts td {
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--row-line);
  vertical-align: middle;
}

.account-row {
  transition: background-color 140ms ease;
}

.account-row:hover {
  background: var(--row-hover);
}

.account-row:last-child td {
  border-bottom: 0;
}

.identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 999px;
  background: hsl(var(--hue) 62% 93%);
  color: hsl(var(--hue) 45% 27%);
  border: 1px solid hsl(var(--hue) 45% 86%);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.identity__name {
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--ink);
  line-height: 1.35;
  transition: color 140ms ease;
}

.account-row:hover .identity__name {
  color: var(--sf-deep);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  padding: 0.22rem 0.6rem;
  border: 1px solid hsl(var(--hue) 40% 88%);
  border-radius: 999px;
  background: hsl(var(--hue) 55% 96%);
  color: hsl(var(--hue) 35% 30%);
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill__dot {
  width: 0.35rem;
  height: 0.35rem;
  flex: none;
  border-radius: 999px;
  background: hsl(var(--hue) 65% 48%);
}

.unset {
  font-size: 0.8rem;
  color: var(--muted-soft);
  font-style: italic;
}

.id {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  color: var(--muted);
  white-space: nowrap;
}

.col-actions {
  width: 1%;
  white-space: nowrap;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease, color 120ms ease, background-color 120ms ease;
}

.icon-button svg {
  width: 1rem;
  height: 1rem;
}

.icon-button__label {
  display: none;
}

.account-row:hover .icon-button,
.account-row:focus-within .icon-button {
  opacity: 1;
}

.icon-button:hover {
  background: var(--surface);
  border-color: var(--line-strong);
  color: var(--sf-blue);
}

.icon-button--danger:hover {
  color: var(--danger);
  border-color: #f3c4c4;
  background: #fff5f4;
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: progress;
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .accounts thead {
    display: none;
  }

  .accounts,
  .accounts tbody,
  .accounts tr,
  .accounts td {
    display: block;
    width: 100%;
  }

  .account-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'identity actions'
      'industry industry'
      'id id';
    gap: 0.6rem 0.75rem;
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--row-line);
  }

  .account-row:last-child {
    border-bottom: 0;
  }

  .accounts td {
    padding: 0;
    border: 0;
  }

  .accounts td[data-label='Account'] {
    grid-area: identity;
  }

  .accounts td[data-label='Industry'] {
    grid-area: industry;
  }

  .accounts td[data-label='Salesforce ID'] {
    grid-area: id;
  }

  .accounts td[data-label='Salesforce ID']::before {
    content: 'ID ';
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    color: var(--muted-soft);
  }

  .col-actions {
    grid-area: actions;
    width: auto;
  }

  .actions {
    gap: 0.4rem;
  }

  .icon-button {
    opacity: 1;
    border-color: var(--line);
    background: var(--surface-alt);
    padding: 0.45rem 0.55rem;
  }

  .icon-button__label {
    display: inline;
  }

  .id {
    font-size: 0.68rem;
    white-space: normal;
    word-break: break-all;
  }
}
</style>
