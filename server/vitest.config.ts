import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // The bootstrap opens a socket and wires process signals; it is exercised
      // by the smoke run in the README rather than a unit test.
      exclude: ['src/index.ts'],
    },
  },
});
