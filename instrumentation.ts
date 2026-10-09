/**
 * Server-side observability entry point.
 *
 * `register()` runs once per server instance before any request is handled;
 * `onRequestError` receives every error Next.js catches while rendering a
 * Server Component, running a Server Action or serving a Route Handler.
 */
import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'

import { isNextNavigationSignal } from '@/lib/monitoring/sentry-shared'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  // redirect() / notFound() surface here as thrown errors with a digest.
  if (isNextNavigationSignal(error)) return

  Sentry.captureRequestError(error, request, context)
}
