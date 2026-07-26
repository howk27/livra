// Flat config (ESLint 9+). Migrated from .eslintrc.js.
// eslint-config-expo/flat bundles core (eslint:recommended), @typescript-eslint
// (parser + recommended), and react/react-hooks (incl. rules-of-hooks: error).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = defineConfig([
  // Global ignores (replaces ignorePatterns). A config object with only
  // `ignores` applies the patterns globally.
  {
    ignores: ['dist', 'build', '.expo', 'node_modules'],
  },

  ...expoConfig,

  // Turn off stylistic rules that conflict with Prettier (keep last).
  eslintConfigPrettier,

  // Core rule override — applies to all linted files.
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // TypeScript-only override. Scoped to ts/tsx so the @typescript-eslint
  // plugin is in scope (flat config registers plugins per file pattern).
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Supabase edge functions are DENO, not React Native. They import by URL
  // ('https://deno.land/...', 'jsr:...'), which the RN resolver cannot follow
  // and was never meant to — every such import was landing as an
  // import/no-unresolved ERROR, so the repo's error count grew by one for each
  // new edge function while nothing was actually wrong. Scoped to the folder so
  // the rule keeps protecting the app code, which does have a real resolver.
  {
    files: ['supabase/functions/**/*.ts'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
]);
