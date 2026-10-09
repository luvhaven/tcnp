import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Deliberately throws so you can confirm the Sentry pipeline works end to end
 * on a real deploy — DSN reachable, tunnel not blocked, source maps resolving.
 *
 * In development: just visit /api/monitoring-check.
 * In production: requires the CRON_SECRET bearer token, so nobody can spam
 * your error quota.
 *
 * The thrown error is caught by Next.js and handed to `onRequestError` in
 * instrumentation.ts, which forwards it to Sentry. Expect a 500 response and
 * an issue titled "Sentry monitoring check" within about a minute.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
    }
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  throw new Error('Sentry monitoring check — this error is intentional')
}
