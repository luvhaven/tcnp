# Next.js 16 upgrade candidate (4.3.0)

Branch: codex/nextjs-16-upgrade. Do not merge to production yet.

## Changes

- Next.js 16.3.5, React/React DOM 19.3.0, React Leaflet 5.0.0, and React 19 types.
- Explicit webpack dev/build commands preserve the existing next-pwa and webpack configuration.
- Renamed middleware.ts to proxy.ts, preserving the network-free navigation guard.
- Replaced removed next lint command with ESLint flat configuration, excluding build output and nested agent worktrees. CI now checks lint explicitly because Next.js 16 builds do not run it.
- Applied compatible npm audit fixes without force. The lockfile records all resolutions.

## Release gates

- Existing 14 unit/regression tests pass.
- The final webpack production build passes, including all routes, TypeScript, and service-worker generation.
- Production browser smoke checks on port 3104 pass: login renders, registration tab switches, and unauthenticated dashboard navigation redirects to login with next preserved. No console errors were captured. No account was created or signed in for this smoke check.
- React 19 type checking passed before the first build; the production build also checks types.
- ESLint reports 46 errors and 42 warnings in existing application and utility code. These findings are not suppressed. They include effect-state patterns, unescaped JSX text, and a TypeScript cast in inspect_fks.mjs. A lint pass is required before merge.
- npm audit still reports five findings (four moderate, one high) through the PWA Workbox/terser/serialize-javascript dependency chain. Resolve or formally assess the affected build tooling before release; do not force incompatible transitive versions without PWA verification.
- ESLint 9.39.5 is a migration bridge; npm reports it as unsupported. Move to a supported ESLint release and align the Node engine requirement before promotion.
- Signed-in workflow checks from audit-release-checks.md, installed-PWA upgrade/offline replay checks, map rendering, and a preview deployment remain required.

Production main remains on 4.2.2 / Next.js 15.5.15. Returning the source checkout to main also requires npm ci and a server restart; node_modules is shared between branches. Do not treat an already-running Next.js 15 dev process as verification of this upgrade.

Reference: https://nextjs.org/docs/app/guides/upgrading/version-16
