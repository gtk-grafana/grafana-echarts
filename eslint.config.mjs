import { defineConfig } from 'eslint/config';
import baseConfig from './.config/eslint.config.mjs';

export default defineConfig([
  {
    ignores: [
      '**/logs',
      '**/*.log',
      '**/npm-debug.log*',
      '**/yarn-debug.log*',
      '**/yarn-error.log*',
      '**/.pnpm-debug.log*',
      '**/node_modules/',
      '.yarn/cache',
      '.yarn/unplugged',
      '.yarn/build-state.yml',
      '.yarn/install-state.gz',
      '**/.pnp.*',
      '**/pids',
      '**/*.pid',
      '**/*.seed',
      '**/*.pid.lock',
      '**/lib-cov',
      '**/coverage',
      '**/dist/',
      '**/artifacts/',
      '**/work/',
      '**/ci/',
      'test-results/',
      'playwright-report/',
      'blob-report/',
      'playwright/.cache/',
      'playwright/.auth/',
      '**/.idea',
      '**/.eslintcache',
      '**/pnpm-lock.yaml',
    ],
  },
  ...baseConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Require type-only imports to be annotated with the `type` keyword.
      // `inline-type-imports` keeps a single import statement to avoid conflicting
      // with the `no-duplicate-imports` rule.
      // https://typescript-eslint.io/rules/consistent-type-imports/
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // Strict type-safety rules for production source only. Tests and test
    // helpers are excluded so fixtures can use loose types and casts.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'pnpm-lock.yaml'],
    rules: {
      // Ban `any`, the root cause that let untyped code slip through lint.
      // https://typescript-eslint.io/rules/no-explicit-any/
      '@typescript-eslint/no-explicit-any': 'error',
      // Enforce `as` style and flag escape-hatch object-literal casts.
      // https://typescript-eslint.io/rules/consistent-type-assertions/
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'allow-as-parameter' },
      ],
      // '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // Type-aware rules that reject values flowing in/out of `any`, which is
      // how `as any` casts leak untyped data through the codebase.
      // https://typescript-eslint.io/rules/no-unsafe-argument/
      '@typescript-eslint/no-unsafe-argument': 'error',
      // https://typescript-eslint.io/rules/no-unsafe-assignment/
      '@typescript-eslint/no-unsafe-assignment': 'error',
      // https://typescript-eslint.io/rules/no-unsafe-call/
      '@typescript-eslint/no-unsafe-call': 'error',
      // https://typescript-eslint.io/rules/no-unsafe-member-access/
      '@typescript-eslint/no-unsafe-member-access': 'error',
      // https://typescript-eslint.io/rules/no-unsafe-return/
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },
]);
