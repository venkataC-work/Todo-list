import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/coverage', '**/node_modules', 'server/data'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'anywhere' }],
    },
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['client/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/**', '@/app/**', '**/features/**', '**/app/**'],
              message: 'Shared code must not depend on application wiring or feature code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['client/src/features/tasks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/auth/**', '**/auth/**', '@/app/**', '**/app/**'],
              message:
                'The tasks feature uses shared session state, not auth screens or app wiring.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['client/src/features/auth/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/tasks/**', '**/tasks/**', '@/app/**', '**/app/**'],
              message: 'The auth feature must not depend on tasks or app wiring.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**', '**/infrastructure/**', '**/app/**'],
              message:
                'Shared HTTP code must not depend on business modules, storage, or app wiring.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**', '**/app/**'],
              allowTypeImports: true,
              message: 'Storage may use domain types, but must not execute services or app wiring.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/**'],
              message: 'Business modules must not depend on application wiring.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/src/modules/**/*.service.ts', 'server/src/modules/**/*.logic.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'express', message: 'Business rules must remain independent of HTTP.' }],
          patterns: [
            {
              group: ['**/app/**', '**/shared/http/**'],
              message:
                'Business rules use application errors; the HTTP adapter maps them to responses.',
            },
            {
              group: ['**/infrastructure/**'],
              allowTypeImports: true,
              message: 'Services receive storage dependencies rather than constructing adapters.',
            },
          ],
        },
      ],
    },
  },
);
