import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173 },
  test: {
    name: 'client',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
