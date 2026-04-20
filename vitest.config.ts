import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 180000, // Xenova model download on first run
    hookTimeout: 120000,
    reporters: ['verbose'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
