import { defineProject } from 'vitest/config';

// Тесты общего кода Edge Functions (без Deno-зависимостей) в Node.
export default defineProject({
  test: {
    name: 'functions',
    include: ['_tests/**/*.test.ts'],
  },
});
