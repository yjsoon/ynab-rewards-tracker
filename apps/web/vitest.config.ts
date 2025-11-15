import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, '.') },
      { find: /^@ynab-counter\/app-core\/(.*)$/, replacement: path.resolve(__dirname, '../../packages/app-core/src/$1') },
      { find: '@ynab-counter/app-core', replacement: path.resolve(__dirname, '../../packages/app-core/src') },
    ],
  },
});

