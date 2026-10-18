import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'learn/'] },
  js.configs.recommended,
  // Type-aware rules need the compiler's view of the project; they are what
  // catch a forgotten `await` on a Slack or Claude call.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // docs/QA.md: loose types from external APIs must not leak into the domain.
      '@typescript-eslint/no-explicit-any': 'error',
      // docs/QA.md: an unawaited promise turns a handled failure into an unhandled rejection.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // node:test's describe/it return promises that the runner itself awaits.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'beforeEach'] },
          ],
        },
      ],
      // Test fakes implement async interfaces with synchronous bodies on purpose.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
