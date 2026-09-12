import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import { fixupConfigRules } from '@eslint/compat'
import tseslint from 'typescript-eslint'

export default defineConfig([
  ...fixupConfigRules(nextVitals),
  // Use the current parser for JS and TS; Next's bundled Babel parser uses
  // the pre-ESLint-10 scope API. Rules remain the Next core-web-vitals set.
  { languageOptions: { parser: tseslint.parser } },
  globalIgnores(['.next/**', '.next-dev/**', '.claude/**', '.agents/**', '.codex/**', 'public/sw.js', 'public/workbox-*.js', 'public/swe-worker-*.js']),
])
