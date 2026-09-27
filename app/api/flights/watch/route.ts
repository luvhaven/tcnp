import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessCommandCentre } from '@/lib/utils'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { findOpenSkyFlightState, isWithinFlightTrackingWindow, type OpenSkyVector } from '@/lib/flight-tracking'

export const dynamic = 'force-dynamic'

const OPENSKY_API = 'https://opensky-network.org/api/states/all'
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
const ANONYMOUS_REFRESH_SECONDS = 15 * 60
const AUTHENTICATED_REFRESH_SECONDS = 2 * 60
const TRACKING_WINDOW_MS = 6 * 60 * 60 * 1000

type FlightWatchTarget = {
  id: string
  papaName: string
  papaTitle: string | null
  flightNumber: string
  callsign: string | null
  icao24: string | null
  airline: string | null
  departureAirport: string | null
  arrivalAirport: string | null
  scheduledDeparture: string | null
  scheduledArrival: string | null
  itineraryStatus: string
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getOpenSkyToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const response = await fetch(OPENSKY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`OpenSky authentication failed (${response.status})`)
  const result = await response.json() as { access_token?: string; expires_in?: number }
  if (!result.access_token) throw new Error('OpenSky did not return an access token')
  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + Math.max(60, result.expires_in ?? 1800) * 1000,
  }
  return cachedToken.value
}

export async function GET(request: Request) {
  const rateLimit = checkRateLimit(request, 'command-flight-watch', 10, 60_000)
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Flight watch is refreshing too often. Try again shortly.' }, { status: 429 })
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role, oscar, activation_status, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (callerError || !caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return NextResponse.json({ error: 'Active account required' }, { status: 403 })
    }
    if (!canAccessCommandCentre(caller.role, caller.oscar)) {
      return NextResponse.json({ error: 'Command or administrator access required' }, { status: 403 })
    }

    const admin = createAdminClient() as any
    const { data: itineraries, error: itineraryError } = await admin
      .from('flight_itineraries')
      .select('id, papa_id, status')
      .neq('status', 'cancelled')
    if (itineraryError) throw itineraryError

    const itineraryRows = itineraries ?? []
    const itineraryIds = itineraryRows.map((row: any) => row.id)
    const papaIds = Array.from(new Set(itineraryRows.map((row: any) => row.papa_id).filter(Boolean)))
    if (!itineraryIds.length || !papaIds.length) {
      return NextResponse.json({
        source: 'OpenSky Network',
        authenticatedProvider: Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET),
        refreshAfterSeconds: process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET
          ? AUTHENTICATED_REFRESH_SECONDS : ANONYMOUS_REFRESH_SECONDS,
        providerDataAt: null,
        flights: [],
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const [papasResult, legsResult] = await Promise.all([
      admin.from('papas').select('id, title, full_name, is_deleted').in('id', papaIds),
      admin.from('flight_legs')
        .select('id, itinerary_id, flight_number, adsb_callsign, icao24, airline, departure_airport, arrival_airport, scheduled_departure, scheduled_arrival, status')
        .in('itinerary_id', itineraryIds)
        .neq('status', 'cancelled'),
    ])
    if (papasResult.error) throw papasResult.error
    if (legsResult.error) throw legsResult.error

    const papaById = new Map((papasResult.data ?? [])
      .filter((papa: any) => !papa.is_deleted)
      .map((papa: any) => [papa.id, papa]))
    const itineraryById = new Map(itineraryRows.map((row: any) => [row.id, row]))
    const now = Date.now()
    const flights: FlightWatchTarget[] = (legsResult.data ?? []).flatMap((leg: any) => {
      const itinerary = itineraryById.get(leg.itinerary_id) as any
      const papa = itinerary ? papaById.get(itinerary.papa_id) as any : null
      if (!papa || !isWithinFlightTrackingWindow(leg.scheduled_departure, leg.scheduled_arrival, itinerary.status, now, TRACKING_WINDOW_MS)) return []
      return [{
        id: leg.id,
        papaName: papa.full_name,
        papaTitle: papa.title,
        flightNumber: leg.flight_number,
        callsign: leg.adsb_callsign || leg.flight_number,
        icao24: leg.icao24?.toLowerCase() ?? null,
        airline: leg.airline,
        departureAirport: leg.departure_airport,
        arrivalAirport: leg.arrival_airport,
        scheduledDeparture: leg.scheduled_departure,
        scheduledArrival: leg.scheduled_arrival,
        itineraryStatus: itinerary.status,
      }]
    })

    if (!flights.length) {
      return NextResponse.json({
        source: 'OpenSky Network',
        authenticatedProvider: Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET),
        refreshAfterSeconds: process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET
          ? AUTHENTICATED_REFRESH_SECONDS : ANONYMOUS_REFRESH_SECONDS,
        providerDataAt: null,
        flights: [],
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const token = await getOpenSkyToken()
    const refreshAfterSeconds = token ? AUTHENTICATED_REFRESH_SECONDS : ANONYMOUS_REFRESH_SECONDS
    const headers = new Headers({ 'User-Agent': 'TCNP-Protocol-Central-Application/4.4' })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(OPENSKY_API, {
      headers,
      next: { revalidate: refreshAfterSeconds },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) {
      const retryAfter = response.headers.get('x-rate-limit-retry-after-seconds')
        || response.headers.get('retry-after')
      return NextResponse.json({
        error: response.status === 429
          ? 'OpenSky rate limit reached. The last known flight positions are retained.'
          : `OpenSky could not provide flight positions (${response.status}).`,
        retryAfterSeconds: retryAfter ? Number(retryAfter) : null,
      }, {
        status: response.status === 429 ? 429 : 502,
        headers: { 'Cache-Control': 'private, no-store', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
      })
    }

    const data = await response.json() as { time?: number; states?: OpenSkyVector[] | null }
    const vectors = data.states ?? []
    const flightsWithState = flights.map((flight: FlightWatchTarget) => {
      const state = findOpenSkyFlightState(vectors, flight)
      const lastContact = state?.[4] ?? null
      return {
        ...flight,
        state: state ? {
          icao24: state[0],
          callsign: state[1]?.trim() || null,
          latitude: state[6],
          longitude: state[5],
          altitudeMeters: state[7],
          speedMetersPerSecond: state[9],
          heading: state[10],
          onGround: state[8],
          lastContact,
          ageSeconds: lastContact ? Math.max(0, Math.floor(Date.now() / 1000) - lastContact) : null,
        } : null,
      }
    })

    return NextResponse.json({
      source: 'OpenSky Network',
      authenticatedProvider: Boolean(token),
      refreshAfterSeconds,
      providerDataAt: data.time ? new Date(data.time * 1000).toISOString() : null,
      flights: flightsWithState,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Command flight watch failed:', error)
    return NextResponse.json({ error: 'Flight tracking is temporarily unavailable. Try again later.' }, {
      status: 502,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
