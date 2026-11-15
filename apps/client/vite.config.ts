import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Относительные пути: сборка работает и в корне домена, и в подпапке (GitHub Pages).
  base: './',
  server: { port: 5173 },
  test: {
    name: 'client',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
