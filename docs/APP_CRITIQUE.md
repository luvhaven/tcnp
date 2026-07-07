# TCNP Platform — Senior Engineering & Design Critique

*A candid, world-class-team review. Scored 1–5 (5 = best-in-class). This is meant to
be actionable, not flattering.*

---

## Executive summary

TCNP is an ambitious, genuinely differentiated protocol-operations platform with a
strong domain model (call-signs, Oscars, journeys, programs) and a cohesive visual
language. It is **well above** typical internal-tool quality. The gap between where it
is and truly "$100B-org" grade is now mostly in **hardening and consistency**, not
features: security posture of the data layer, a few architectural single-sources-of-truth,
and test/observability coverage.

| Area | Score | One-line verdict |
|---|---|---|
| Visual design & motion | 4.5 | Distinctive, premium, consistent; restrained motion. |
| UX & flows | 4 | Strong; a few role/empty-state edges remain. |
| Frontend architecture | 4 | Clean components; some very large client files. |
| Data model | 4.5 | Rich and well-normalized; a few overlapping columns. |
| Security (RLS/auth) | 3 | Good bones, but real gaps (below) — the top priority. |
| Performance | 4 | Good bundles; realtime + polling could be leaner. |
| Reliability/observability | 2.5 | No tests, console-driven debugging, no error tracking. |

---

## 1. Design & motion — 4.5/5

**Strengths**
- A real design system: HSL token theme, dark-mode parity, `card-hover`, `stat-figure`
  tabular numerals, staggered entrances, spring-based active nav. It feels authored, not assembled.
- Unit pages share a gradient-hero pattern that gives the app a consistent "surface" identity.
- Motion is tasteful and mostly GPU-cheap (framer-motion springs, CSS transitions). The
  deliberate choice to *avoid* three.js/GSAP on field devices is the correct call.

**Where it falls short**
- **Header contrast in light mode**: gradient heroes are dark-on-dark by design, but a few
  cards rely on `/5` opacity fills that wash out on bright displays. Audit against WCAG AA.
- **Empty states are inconsistent** — some pages have beautiful `empty-state` blocks, others
  drop a bare "No data". Standardize on one component.
- **No skeleton parity**: dashboard has rich skeletons; newer pages (sierra, finance) use a
  single spinner. Skeletons should match final layout everywhere.

---

## 2. UX & flows — 4/5

**Strengths**
- The call-sign workflow is the star: DO taps a sign → optimistic update → realtime to
  Command → offline queue → auto-incident on Broken Arrow. That is a genuinely
  well-thought-out operational loop.
- Mission-availability → roster-assignment is a real workflow, not a toy.
- Creation-flow ownership (registries owned by units; journeys compose them via the
  Operational Readiness panel) is now principled and documented.

**Where it falls short**
- **Two profile/identity surfaces** historically (`avatar_url` vs `photo_url`) — consolidate
  on `photo_url` everywhere (mostly done; finish the sweep).
- **Notification fan-out is synchronous** in route handlers (mission request / food alarm
  insert N rows in a loop). Fine at 32 users; at 500+ move to a queue or a single
  `insert ... select`.
- **DO "view only" vs "can update"** is computed in several places with slightly different
  role lists. Centralize in `lib/utils` (partly done — keep going).

---

## 3. Frontend architecture — 4/5

**Strengths**
- `useCurrentUser` as a single cached identity source is exactly right and eliminated
  ~15 redundant auth calls.
- Feature-foldered components; server components for initial data, client islands for
  interactivity.
- Supabase client is a module singleton — avoids the multi-instance realtime bug.

**Where it falls short**
- **God components**: `JourneysClient.tsx` (~1.5k lines), `ChatSystem.tsx` (~1.5k),
  `officers/OfficersClient.tsx` (~1.3k). These should be split into hooks + subcomponents;
  they are the highest-risk files to change.
- **`as any` on Supabase queries is pervasive.** The regenerated types exist — lean on them.
  Every `(supabase as any)` is a silent schema-drift landmine.
- **Realtime + 60s polling** run together on Ops Monitor. Keep polling only as a reconnect
  fallback, not a always-on redundant fetch.

---

## 4. Data model — 4.5/5

**Strengths**
- Enum-driven roles/call-signs, soft-delete columns, audit_logs (180k+ rows — it's real),
  RLS enabled on every app table, SECURITY DEFINER helper functions (`is_admin`, `has_any_role`).
- New feature tables (media_assets, seat_arrangements, mission_*, etc.) are consistent and FK'd.

**Where it falls short**
- **Overlapping columns** on `journeys` (`status` vs `current_status` vs `current_call_sign`)
  and `users` (`avatar_url` vs `photo_url`). Pick one, migrate, drop the other. Ambiguity here
  will eventually cause a "why is the badge wrong" bug.
- **`journey_events.event_type` uses Title-Case enum** while `journeys.status` uses
  underscore enum — two vocabularies for one concept. Document or unify.

---

## 5. Security — 3/5 (top priority)

**Strengths**
- RLS is on everywhere; policies use centralized `has_any_role`/`is_admin`.
- Service-role key is server-only; rate-limiting wraps sensitive routes; middleware guards
  activation status at the edge.

**Real gaps to close**
1. **CSP allows `'unsafe-inline'` and `'unsafe-eval'`** for scripts. Next needs some of this,
   but move toward nonces; `unsafe-eval` should be removable in production.
2. **`img-src *`** is wide open. It was opened for map tiles — scope it to the known tile/CDN
   hosts instead of `*`.
3. **Super-admin hardcoded by email in middleware** (`doriazowan@gmail.com`). Convenient, but
   it's an auth bypass that lives in code. Move to a role/claim check.
4. **Client-side role gating is UX, not security** — always mirror it in RLS (mostly done;
   audit every new table's policies match the UI's intent, especially `papa_accommodations`
   DO-scoping which is subtle).
5. **No security headers test** and **no dependency scanning** in CI. Add `npm audit` gate.

---

## 6. Performance — 4/5
- First-load JS ~105 kB shared is healthy. Heaviest routes (chat 429 kB) are justified but
  worth a lazy-load pass on Leaflet/recharts.
- Images are user-uploaded and unoptimized — route them through `next/image` or a transform
  CDN; enforce max dimensions on upload.
- Consider `staleTime` tuning and query-key discipline to cut refetch storms on realtime pages.

---

## 7. Reliability & observability — 2.5/5 (the real weak point)
- **No automated tests.** For an app running live convoy operations, at least: unit tests on
  `lib/utils` role logic and `profile-completion`, and an e2e smoke on login → dashboard →
  call-sign update. This is the single highest-leverage investment left.
- **Debugging is `console.warn`-driven.** Add Sentry (or equivalent) for client + route errors.
- **No CI.** A GitHub Action running `tsc`, `lint`, `build`, and `npm audit` on PRs would
  prevent the schema-drift and dead-import classes of bug we've been fixing by hand.

---

## Top 7 things to do next (in order)
1. Tighten CSP (`img-src` allowlist, drop `unsafe-eval` in prod, work toward nonces).
2. Replace the hardcoded super-admin email with a role/claim check.
3. Add CI: `tsc` + `lint` + `build` + `npm audit` on every PR.
4. Introduce tests for role logic + a login→ops smoke path.
5. Break up the three god components into hooks + subcomponents.
6. Resolve duplicate columns (`status`/`current_status`, `avatar_url`/`photo_url`).
7. Add Sentry and route images through an optimizer.

**Bottom line:** the product vision and execution are genuinely impressive. What separates it
from a $100B-org app now is not more features — it's the boring, essential discipline of
security hardening, test coverage, and killing the last ambiguities in the data layer.
