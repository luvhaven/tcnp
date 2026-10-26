import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import { fixupConfigRules } from '@eslint/compat'
import tseslint from 'typescript-eslint'

export default defineConfig([
  ...fixupConfigRules(nextVitals),
  // Use the current parser for JS and TS; Next's bundled Babel parser uses
  // the pre-ESLint-10 scope API. Rules remain the Next core-web-vitals set.
  { languageOptions: { parser: tseslint.parser } },
  // eslint-config-next 16.4 turns on the React Compiler rules as errors. The
  // existing code predates them; report as warnings until it is migrated.
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  globalIgnores(['.next/**', '.next-dev/**', '.claude/**', '.agents/**', '.codex/**', '.tmp-audit/**', 'outputs/**', 'public/sw.js', 'public/workbox-*.js', 'public/swe-worker-*.js', 'public/worker-*.js']),
])
