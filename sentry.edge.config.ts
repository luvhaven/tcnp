/**
 * Edge runtime error monitoring (Sentry).
 *
 * Loaded by `instrumentation.ts` -> `register()`. This covers `proxy.ts`
 * (the routing guard formerly known as middleware) and any route that opts
 * into the edge runtime.
 */
import * as Sentry from '@sentry/nextjs'

import {
  DATA_COLLECTION,
  IGNORED_ERRORS,
  isNextNavigationSignal,
  redactUrl,
  resolveDsn,
  resolveEnvironment,
  resolveRelease,
} from '@/lib/monitoring/sentry-shared'

const dsn = resolveDsn(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)

if (dsn) {
  Sentry.init({
    dsn,
    environment: resolveEnvironment(),

    // Set SENTRY_DEBUG=true to print what the SDK is doing to the console.
    // This is how you answer "why am I not seeing any events" without
    // guessing — it logs dropped events, filtered events and transport
    // failures. Never leave it on in production; it is noisy.
    debug: process.env.SENTRY_DEBUG === 'true',
    release: resolveRelease(),
    // Server request bodies contain journey details and personal data, and
    // headers carry the Supabase service role key. See
    // lib/monitoring/sentry-shared.ts for the full policy.
    dataCollection: DATA_COLLECTION,

    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    ignoreErrors: IGNORED_ERRORS,

    beforeSend(event, hint) {
      // proxy.ts redirects unauthenticated navigations on every request.
      if (isNextNavigationSignal(hint?.originalException)) return null

      if (event.request?.url) {
        event.request.url = redactUrl(event.request.url)
      }
      return event
    },
  })
}
