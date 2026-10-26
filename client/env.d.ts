/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional override for the API base URL. Leave unset in development
   * (the Vite proxy forwards /api) and in production (same origin).
   * Example: https://account-manager-api.onrender.com/api
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
