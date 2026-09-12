# Next.js 16 upgrade candidate (4.3.1)

Branch: codex/nextjs-16-upgrade. Do not merge to production yet.

## Changes

- Next.js 16.3.5, React/React DOM 19.3.0, React Leaflet 5.0.0, and React 19 types.
- Explicit webpack dev/build commands preserve the existing next-pwa and webpack configuration.
- Renamed middleware.ts to proxy.ts, preserving the network-free navigation guard.
- Replaced removed next lint command with ESLint flat configuration, excluding build output and nested agent worktrees. CI now checks lint explicitly because Next.js 16 builds do not run it.
- Applied compatible npm audit fixes without force. The lockfile records all resolutions.

## Release gates

- All 16 unit/regression tests pass, including two new server-rendering browser-snapshot tests.
- The final webpack production build passes, including all routes, TypeScript, and service-worker generation.
- Production browser smoke checks on port 3104 pass: login renders, registration tab switches, and unauthenticated dashboard navigation redirects to login with next preserved. No console errors were captured. No account was created or signed in for this smoke check.
- React 19 type checking passed before the first build; the production build also checks types.
- ESLint passes with zero errors and 42 existing warnings; no additional rule suppression. Browser-only values now use hydration-safe snapshots, and render-time state derivation replaces redundant effects.
- npm audit reports zero vulnerabilities. Scoped Workbox 7.4.1 overrides remove the vulnerable build dependency chain. The webpack build successfully generates the updated service worker.
- ESLint 10.10.0 with typescript-eslint 8.70.0 and @eslint/compat 2.1.1 supports the Next rules without relying on the removed ESLint APIs. Node engines now require ^20.19.0, ^22.13.0, or >=24.
- Live QA run 7a7f82f6 passes all 24 checks against the production-mode server on port 3106: unit boundaries, privilege escalation protection, notification isolation, dashboard document access, admin APIs, and inactive/suspended account denial. All four temporary accounts were disabled. An initial sandboxed run failed two checks due to server network EACCES; its four accounts were also disabled before the successful rerun.
- Browser smoke on the rebuilt candidate verified login and access-request tab interaction with no captured console errors. This is not a signed-in visual workflow test.
- Fixed notification timer cleanup, system-theme change handling, and stale map marker references after map teardown.
- Signed-in workflow checks from audit-release-checks.md, installed-PWA upgrade/offline replay checks, map rendering, and a preview deployment remain required.

Production main remains on 4.2.2 / Next.js 15.5.15. Returning the source checkout to main also requires npm ci and a server restart; node_modules is shared between branches. Do not treat an already-running Next.js 15 dev process as verification of this upgrade.

Reference: https://nextjs.org/docs/app/guides/upgrading/version-16
