<script setup lang="ts">
import type { ApiLimits } from '@/types/account';
import LimitsBadge from './LimitsBadge.vue';

defineProps<{
  limits: ApiLimits | null;
  limitsLoading: boolean;
  mode: 'live' | 'mock' | null;
  apiVersion: string | null;
}>();
</script>

<template>
  <header class="masthead">
    <div class="masthead__inner">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" role="presentation">
            <path
              d="M8.5 21.5a5 5 0 0 1 .8-9.94A6.4 6.4 0 0 1 21.7 10.4a4.9 4.9 0 0 1 1.8 9.5"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
            <path
              d="M11 25.2h10"
              stroke="#5eead4"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
        </span>

        <div class="brand__text">
          <p class="brand__eyebrow">Salesforce · Accounts</p>
          <p class="brand__name">Account Manager</p>
        </div>
      </div>

      <div class="masthead__meta">
        <span
          v-if="mode"
          class="mode"
          :class="mode === 'mock' ? 'mode--mock' : 'mode--live'"
          :title="
            mode === 'mock'
              ? 'SF_MOCK=true — the API is serving in-memory demo data.'
              : 'Connected to a real Salesforce org with OAuth 2.0 client credentials.'
          "
        >
          <span class="mode__dot" aria-hidden="true" />
          {{ mode === 'mock' ? 'Demo data' : 'Live org' }}
        </span>

        <LimitsBadge :limits="limits" :loading="limitsLoading" />
      </div>
    </div>

    <div class="masthead__ticker">
      <span>Node.js · Express</span>
      <span aria-hidden="true">/</span>
      <span>jsforce OAuth 2.0</span>
      <span aria-hidden="true">/</span>
      <span>Vue 3 · Pinia</span>
      <span class="masthead__version">
        API {{ apiVersion ? `v${apiVersion}` : '—' }}
      </span>
    </div>
  </header>
</template>

<style scoped>
.masthead {
  position: sticky;
  top: 0;
  z-index: 20;
  background:
    radial-gradient(120% 180% at 12% -40%, rgb(13 157 218 / 28%), transparent 60%),
    linear-gradient(180deg, #0a2137 0%, #081a2b 100%);
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  color: #f7fbff;
}

.masthead__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  width: min(1180px, calc(100% - 3rem));
  margin-inline: auto;
  padding: 1.05rem 0 0.95rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.7rem;
  color: #e8f4ff;
  background: linear-gradient(150deg, #0176d3 0%, #0b3f6e 100%);
  border: 1px solid rgb(255 255 255 / 16%);
  box-shadow: 0 6px 18px rgb(1 118 211 / 35%);
}

.brand__mark svg {
  width: 1.55rem;
  height: 1.55rem;
}

.brand__text {
  min-width: 0;
}

.brand__eyebrow {
  margin: 0 0 0.1rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(190 219 245 / 65%);
}

.brand__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 550;
  letter-spacing: -0.01em;
  line-height: 1.1;
}

.masthead__meta {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mode {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.36rem 0.62rem;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 14%);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(233 245 255 / 85%);
  white-space: nowrap;
}

.mode__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: currentColor;
}

.mode--live {
  color: #8ef0c9;
}

.mode--mock {
  color: #ffd88a;
}

.masthead__ticker {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: min(1180px, calc(100% - 3rem));
  margin-inline: auto;
  padding: 0.55rem 0 0.6rem;
  border-top: 1px solid rgb(255 255 255 / 7%);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgb(178 205 230 / 45%);
}

.masthead__version {
  margin-left: auto;
  color: rgb(178 205 230 / 65%);
}

@media (max-width: 720px) {
  .masthead__inner {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    width: calc(100% - 2rem);
  }

  .masthead__meta {
    justify-content: space-between;
  }

  .masthead__ticker {
    width: calc(100% - 2rem);
    flex-wrap: wrap;
    row-gap: 0.2rem;
  }

  .masthead__version {
    margin-left: 0;
  }
}
</style>
