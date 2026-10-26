<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AccountFormModal from './components/AccountFormModal.vue';
import AccountList from './components/AccountList.vue';
import AppHeader from './components/AppHeader.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import EmptyState from './components/EmptyState.vue';
import LoadingRows from './components/LoadingRows.vue';
import SearchBox from './components/SearchBox.vue';
import StatusBanner from './components/StatusBanner.vue';
import { ApiError } from './api/accounts';
import { useAccountsStore } from './stores/accounts';
import { useOrgStore } from './stores/org';
import type { Account, AccountInput } from './types/account';
import { formatSyncTime } from './utils/format';

const accounts = useAccountsStore();
const org = useOrgStore();

const formOpen = ref(false);
const editingAccount = ref<Account | null>(null);
const formError = ref<string | null>(null);
const pendingDelete = ref<Account | null>(null);
const deleteError = ref<string | null>(null);
const toast = ref<string | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const countLabel = computed(() => {
  if (accounts.loading && !accounts.hasLoadedOnce) return 'Loading…';
  if (accounts.isSearching) {
    return `${accounts.filteredAccounts.length} of ${accounts.total} accounts`;
  }
  return `${accounts.total} ${accounts.total === 1 ? 'account' : 'accounts'}`;
});

const lastSyncedLabel = computed(() => formatSyncTime(accounts.lastSyncedAt));

function showToast(message: string): void {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 4200);
}

function openCreate(): void {
  editingAccount.value = null;
  formError.value = null;
  formOpen.value = true;
}

function openEdit(account: Account): void {
  editingAccount.value = account;
  formError.value = null;
  formOpen.value = true;
}

function closeForm(): void {
  if (accounts.saving) return;
  formOpen.value = false;
  formError.value = null;
  editingAccount.value = null;
}

async function submitForm(input: AccountInput): Promise<void> {
  formError.value = null;

  try {
    if (editingAccount.value) {
      await accounts.update(editingAccount.value.id, input);
      showToast(`Updated “${input.name}”.`);
    } else {
      await accounts.create(input);
      showToast(`Created “${input.name}” in Salesforce.`);
    }

    formOpen.value = false;
    editingAccount.value = null;
  } catch (error) {
    formError.value =
      error instanceof ApiError
        ? error.message
        : 'Could not save the account. Please try again.';
  }
}

function askDelete(account: Account): void {
  deleteError.value = null;
  pendingDelete.value = account;
}

async function confirmDelete(): Promise<void> {
  const target = pendingDelete.value;
  if (!target) return;

  deleteError.value = null;

  try {
    await accounts.remove(target.id);
    pendingDelete.value = null;
    showToast(`Deleted “${target.name}”.`);
  } catch (error) {
    deleteError.value =
      error instanceof ApiError
        ? error.message
        : 'Could not delete the account. Please try again.';
  }
}

function refresh(): void {
  void accounts.load();
  void org.load();
}

onMounted(() => {
  void accounts.load();
  void org.load();
});

onBeforeUnmount(() => {
  clearTimeout(toastTimer);
});
</script>

<template>
  <div class="app">
    <AppHeader
      :limits="org.limits"
      :limits-loading="org.loading"
      :mode="org.mode"
      :api-version="org.apiVersion"
    />

    <main class="shell">
      <section class="intro" aria-labelledby="page-title">
        <div class="intro__text">
          <p class="intro__eyebrow">Account portfolio</p>
          <h1 id="page-title" class="intro__title">
            Accounts<span class="intro__period" aria-hidden="true">.</span>
          </h1>
          <p class="intro__copy">
            Read and manage your org’s accounts through the Salesforce REST API. The twenty most
            recently modified records appear first.
          </p>
        </div>

        <dl class="stats">
          <div class="stat">
            <dt>Loaded</dt>
            <dd>{{ accounts.total }}</dd>
          </div>
          <div class="stat">
            <dt>Last sync</dt>
            <dd class="stat__small">{{ lastSyncedLabel }}</dd>
          </div>
          <div class="stat">
            <dt>API</dt>
            <dd class="stat__small">{{ org.apiVersion ? `v${org.apiVersion}` : '—' }}</dd>
          </div>
        </dl>
      </section>

      <div class="toolbar">
        <div class="toolbar__search">
          <SearchBox v-model="accounts.search" />
          <span class="toolbar__count" role="status" aria-live="polite">{{ countLabel }}</span>
        </div>

        <div class="toolbar__actions">
          <button
            type="button"
            class="button button--quiet"
            :disabled="accounts.loading"
            @click="refresh"
          >
            <svg
              class="button__icon"
              :class="{ spin: accounts.loading }"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M14.5 8.2A5.7 5.7 0 1 0 14 12M14.5 3.8v4.4H10"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Refresh
          </button>

          <button type="button" class="button button--primary" @click="openCreate">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M9 4v10M4 9h10"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
            New account
          </button>
        </div>
      </div>

      <StatusBanner
        v-if="accounts.errorMessage"
        class="banner"
        :message="accounts.errorMessage"
        :details="accounts.errorDetails"
        retryable
        @retry="refresh"
        @dismiss="accounts.clearError()"
      />

      <LoadingRows v-if="accounts.loading && !accounts.hasLoadedOnce" />

      <AccountList
        v-else-if="accounts.filteredAccounts.length > 0"
        :accounts="accounts.filteredAccounts"
        :deleting-id="accounts.deletingId"
        @edit="openEdit"
        @remove="askDelete"
      />

      <EmptyState
        v-else
        :is-searching="accounts.isSearching"
        :query="accounts.search"
        @create="openCreate"
        @clear-search="accounts.search = ''"
      />
    </main>

    <footer class="footer">
      <p class="footer__note">
        <span class="footer__dot" aria-hidden="true" />
        Salesforce credentials stay on the server — the browser only sees <code>/api</code>.
      </p>
      <p class="footer__stack">Vue 3 · Pinia · Express · jsforce</p>
    </footer>

    <AccountFormModal
      v-if="formOpen"
      :key="editingAccount?.id ?? 'new'"
      :account="editingAccount"
      :busy="accounts.saving"
      :server-error="formError"
      :suggested-industries="accounts.industryOptions"
      @submit="submitForm"
      @close="closeForm"
    />

    <ConfirmDialog
      v-if="pendingDelete"
      :account="pendingDelete"
      :busy="accounts.deletingId === pendingDelete.id"
      :error-message="deleteError"
      @confirm="confirmDelete"
      @cancel="
        pendingDelete = null;
        deleteError = null;
      "
    />

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status" aria-live="polite">
        <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="m4 9.5 3.2 3L14 5.5"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.shell {
  flex: 1;
  width: min(1180px, calc(100% - 3rem));
  margin-inline: auto;
  padding: 2.75rem 0 3.5rem;
}

.intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding-bottom: 1.6rem;
  border-bottom: 1px solid var(--line);
}

.intro__eyebrow {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.55rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sf-blue);
}

.intro__eyebrow::before {
  content: '';
  width: 1.6rem;
  height: 1px;
  background: var(--sf-blue);
}

.intro__title {
  margin: 0 0 0.5rem;
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 5vw, 3.35rem);
  font-weight: 550;
  font-variation-settings: 'SOFT' 40, 'WONK' 1;
  line-height: 0.98;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.intro__period {
  color: var(--sf-blue);
}

.intro__copy {
  max-width: 54ch;
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--muted);
}

.stats {
  display: flex;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.stat {
  min-width: 6.4rem;
  padding: 0.7rem 1.05rem;
  border-right: 1px solid var(--line);
}

.stat:last-child {
  border-right: 0;
}

.stat dt {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted-soft);
}

.stat dd {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 550;
  line-height: 1.1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.stat .stat__small {
  padding-top: 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--muted);
  white-space: nowrap;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 1.4rem 0 1rem;
}

.toolbar__search {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  flex: 1 1 24rem;
  min-width: 0;
}

.toolbar__count {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-soft);
  white-space: nowrap;
}

.toolbar__actions {
  display: flex;
  gap: 0.5rem;
}

.button__icon {
  transition: transform 300ms ease;
}

.banner {
  margin-bottom: 1rem;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  width: min(1180px, calc(100% - 3rem));
  margin-inline: auto;
  padding: 1.1rem 0 1.6rem;
  border-top: 1px solid var(--line);
}

.footer__note {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.74rem;
  color: var(--muted-soft);
}

.footer__note code {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--muted);
}

.footer__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 3px rgb(16 185 129 / 14%);
}

.footer__stack {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted-soft);
}

.toast {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  max-width: min(26rem, calc(100vw - 2rem));
  padding: 0.7rem 1rem;
  border: 1px solid rgb(94 234 212 / 35%);
  border-radius: 0.6rem;
  background: #08243a;
  color: #eaf5ff;
  font-size: 0.85rem;
  box-shadow: 0 16px 34px rgb(3 20 35 / 28%);
}

.toast svg {
  flex: none;
  width: 1.05rem;
  height: 1.05rem;
  color: #5eead4;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 900px) {
  .intro {
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
  }

  .stats {
    width: 100%;
  }

  .stat {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .shell {
    width: calc(100% - 2rem);
    padding-top: 1.75rem;
  }

  .toolbar {
    gap: 0.75rem;
  }

  .toolbar__search {
    flex-direction: column;
    align-items: stretch;
    gap: 0.45rem;
    flex-basis: 100%;
  }

  .toolbar__actions {
    width: 100%;
  }

  .toolbar__actions .button {
    flex: 1;
    justify-content: center;
  }

  .stat {
    padding: 0.65rem 0.8rem;
  }

  .footer {
    width: calc(100% - 2rem);
  }

  .toast {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
  }
}
</style>
