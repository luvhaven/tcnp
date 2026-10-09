# Error Monitoring (Sentry)

Production error reporting for the browser, the Node server and the Edge
runtime. The point is to see a crash, with a real stack trace and the officer
it affected, before anyone has to report it.

The SDK is **inert until a DSN is configured** — no DSN means no network calls
and no overhead, so local development is unaffected.

---

## One-time setup

Two people are involved: whoever creates the Sentry project collects four
values, and whoever controls the deployment environment variables (the CTO)
pastes them into Vercel. Only the last step needs Vercel access.

### 1. Create the Sentry project

1. Sign up at <https://sentry.io>. The free tier covers 5k errors and 50
   replays a month, comfortably more than this app produces.
2. **Choose the EU (Frankfurt) data region.** This is permanent — it cannot
   be changed later without creating a new organization and losing history.
   EU is the defensible destination for Nigerian personal data under the
   NDPA 2023, which requires the recipient to be subject to a law affording
   adequate protection.
3. Create a project: platform **Next.js**, name it `tcnp`.

### 2. Collect the four values

| Variable                 | Where to find it in Sentry |
| ------------------------ | -------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | **Settings → Projects → tcnp → Client Keys (DSN)**. Copy the full DSN string. |
| `SENTRY_ORG`             | `tcnp` — the organization **slug**, not its display name. Confirm under **Settings → General Settings → Organization Slug**, or read it off any Sentry URL (`tcnp.sentry.io`). |
| `SENTRY_PROJECT`         | `tcnp` — the project **slug**. Shown under **Settings → Projects → tcnp → Project Settings**. Org and project slugs live in separate namespaces, so both being `tcnp` is fine. |
| `SENTRY_AUTH_TOKEN`      | **Settings → Developer Settings → Organization Tokens → Create New Token** (prefix `sntrys_`). **Shown exactly once** — copy it immediately or create another. |

Use an **organization** token, not a personal one. A personal token is bound
to one person's account: when they leave or their access is revoked, source
map uploads stop silently — the build still succeeds, it just quietly reverts
to minified stack traces. Organization tokens also come with the scopes CI
needs (`org:read`, `project:releases`) already set.

Renaming the organization slug later is safe for the DSN, which identifies the
org by numeric id rather than by slug — but `SENTRY_ORG` must be updated to
match or source map uploads start failing.

A region-correct DSN looks like
`https://<key>@o<orgId>.ingest.de.sentry.io/<projectId>` — the `.de.` segment
confirms the EU region. A US DSN has `.us.` or no region segment at all.

### 3. Verify the values before handing them over

Do this locally so the CTO's step is pure copy-paste and cannot fail silently.
Put all four in `.env.local`, then:

```bash
npm run build && SENTRY_DEBUG=true npm start
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/monitoring-check
```

A `500` response plus a new issue in Sentry means the DSN is right. Watch the
build output for a successful source map upload to confirm the auth token and
the two slugs are right too.

`.env.local` is gitignored. Never commit the auth token — it can write to your
Sentry organization.

### 4. Hand the four variables to whoever controls Vercel

They add them under **Project → Settings → Environment Variables**, scoped to
**Production** and **Preview**, then trigger a redeploy. Environment variables
only apply to new builds, so an existing deployment will not pick them up.

`SENTRY_AUTH_TOKEN` must be marked sensitive and must never be prefixed with
`NEXT_PUBLIC_` — that would ship an organization-write token to every browser.
The other three are safe to expose.

### 5. Verify on the real deploy

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-app>/api/monitoring-check
```

Expect a `500` response and an issue titled
**"Sentry monitoring check — this error is intentional"** in Sentry within
about a minute. If the stack trace names
`app/api/monitoring-check/route.ts`, source maps are working too.

### If nobody can set environment variables

Errors can still be captured with only a code change. Set `FALLBACK_DSN` in
`lib/monitoring/sentry-shared.ts` to the DSN and merge it. A DSN only grants
permission to write events, cannot read issues, and is already readable in the
deployed client bundle — but this repository is public, so rate-limit the
client key and set **Inbound Filters → Allowed Domains** first.

The environment variable always takes precedence, so this needs no unwinding
later.

What you lose without `SENTRY_AUTH_TOKEN` in the build environment: source
maps. Stack traces stay minified, pointing at `main-a1b2c3.js:1:48210` instead
of `components/tracking/LiveTrackingMap.tsx:209`. Everything else — the error
itself, breadcrumbs, replays, user and unit tags — works normally. There is no
way around this one without the token being present at build time.

---

## What gets captured

| Source                             | Wired in                              |
| ---------------------------------- | ------------------------------------- |
| Crashes before React hydration     | `instrumentation-client.ts`           |
| Server Components, Route Handlers, Server Actions | `instrumentation.ts` → `onRequestError` |
| `proxy.ts` and other Edge code     | `sentry.edge.config.ts`               |
| React render crashes               | `components/ErrorBoundary.tsx`        |
| Route-level crashes                | `app/(dashboard)/error.tsx`           |
| Root layout crashes                | `app/global-error.tsx`                |
| Who it happened to                 | `components/monitoring/SentryUserContext.tsx` |

Every report is tagged with `role`, `unit`, `team`, `is_team_head` and
`profile_complete`, so "some users see an error" becomes "this hits Papa unit
team leads with incomplete profiles".

The `ErrorBoundary` wiring matters most: before it, a caught error showed the
user a recovery card and was then silently discarded. Those are exactly the
errors nobody could reproduce.

---

## Privacy

This app holds officer identities, live locations and journey details, so data
collection is pinned explicitly in `lib/monitoring/sentry-shared.ts`.

**SDK v11 replaced `sendDefaultPii` with `dataCollection` and inverted the
defaults** — cookies, request/response headers, request bodies and
stack-frame local variables are now collected *unless* disabled. All of them
are disabled here. `tests/sentry-monitoring.test.cjs` fails if any flips back
on.

- **Sent:** user id, email, role, unit, team, route, stack trace, browser and
  device, breadcrumbs of clicks and navigations.
- **Not sent:** full name, phone, address, date of birth, bio, cookies,
  auth headers, request bodies, database rows.
- **Session tokens:** `redactUrl` strips `access_token`, `refresh_token`,
  `code` and friends from every URL, because Supabase returns them in the URL
  fragment on auth callbacks and those URLs reach breadcrumbs.

### Session Replay

Records only the ~30 seconds leading up to an error, never ordinary sessions.
`maskAllText`, `maskAllInputs` and `blockAllMedia` are on, so a replay shows
layout and the order of interactions but no names, addresses or journey data.

To change this, edit `replayIntegration` in `instrumentation-client.ts`.
Unmasking text would store officer data in Sentry — clear it with whoever owns
data policy first.

---

## Two project-specific gotchas

Both of these silently discard every error report if they regress.

1. **The CSP blocks `ingest.sentry.io`.** `connect-src` in `next.config.js`
   only allows self and Supabase. Browser events are therefore routed through
   `tunnelRoute: '/monitoring'` on our own origin. This also defeats ad
   blockers, which drop requests to `sentry.io` — and would otherwise hide
   errors from exactly the users most likely to run one.

2. **`proxy.ts` would redirect the tunnel to `/login`.** `monitoring` is
   excluded from the proxy matcher. Without that exclusion, error reports from
   logged-out users get a `307` to `/login`, so login-page crashes — the ones
   that lock people out entirely — are never reported.

The service worker is also declared `NetworkOnly` for `/monitoring` in
`next.config.js`, so cached responses can never stand in for a report.

---

## Debugging missing events

Set `SENTRY_DEBUG=true` (server) or `NEXT_PUBLIC_SENTRY_DEBUG=true` (browser)
and watch the console. The SDK logs every event it captures, filters or fails
to transmit, including the HTTP status from ingest:

```
Sentry Logger [log]: Captured error event `...`
Sentry Logger [warn]: Sentry responded with status code 400 to sent event.
```

Never leave it on in production — it is very noisy.

Expected silences, by design:

- `redirect()` and `notFound()` throw internally. `isNextNavigationSignal`
  filters them, otherwise `proxy.ts` alone would report thousands of
  non-events per day.
- `ResizeObserver loop` warnings and cancelled-fetch `AbortError`s are
  filtered via `IGNORED_ERRORS`. Keep that list short — the whole point is to
  see errors.
- Browser extension frames are dropped via `DENY_URLS`.

## Tuning

| Variable                                  | Default | Effect                                 |
| ----------------------------------------- | ------- | -------------------------------------- |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`   | `0.1`   | Browser performance tracing            |
| `SENTRY_TRACES_SAMPLE_RATE`               | `0.1`   | Server performance tracing             |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`          | `VERCEL_ENV` | Environment label in the Sentry UI |

Errors are always captured at 100%; these only affect performance tracing.
