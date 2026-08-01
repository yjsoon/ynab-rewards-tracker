import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ynab-counter/app-core/storage': fileURLToPath(
        new URL('../../packages/app-core/src/storage/index.ts', import.meta.url),
      ),
      '@ynab-counter/app-core/cloud-sync': fileURLToPath(
        new URL('../../packages/app-core/src/cloud-sync/index.ts', import.meta.url),
      ),
      '@ynab-counter/app-core': fileURLToPath(
        new URL('../../packages/app-core/src', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
  },
});
