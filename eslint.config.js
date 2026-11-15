// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nondeterministic = 'Симуляция должна быть детерминированной (см. CLAUDE.md).';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/client/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.config.{js,ts}', '**/*.config.{js,ts}', 'packages/bots/scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: nondeterministic },
        { name: 'performance', message: nondeterministic },
        { name: 'setTimeout', message: nondeterministic },
        { name: 'setInterval', message: nondeterministic },
        { name: 'crypto', message: nondeterministic },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: nondeterministic },
      ],
      // Только относительные импорты: у sim нет зависимостей.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}/)',
              message: 'packages/sim не должен иметь зависимостей.',
            },
          ],
        },
      ],
    },
  },
);
