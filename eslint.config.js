import globals from 'globals';
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // 1. Base ESLint Recommended Rules
  js.configs.recommended,

  // 2. TypeScript-specific Setup
  {
    files: ['**/*.ts'], // Target only TypeScript files
    plugins: {
      '@typescript-eslint': ts,
    },
    languageOptions: {
      parser: tsParser, // <-- MOVED HERE
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    rules: {
      // 3. Apply TypeScript Recommended Rules
      ...ts.configs.recommended.rules,

      // 4. Custom/Stricter Rules (optional, but good practice)
      // e.g., enforce using type imports for clarity
      '@typescript-eslint/consistent-type-imports': 'error',

      // Disable the base rule that conflicts with TS version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },

  // 5. Prettier Integration (must be last to override)
  // This turns off all ESLint rules that conflict with Prettier.
  eslintConfigPrettier,
];
