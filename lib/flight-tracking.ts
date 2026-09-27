export type OpenSkyVector = [
  string, string | null, string, number | null, number, number | null, number | null,
  number | null, boolean, number | null, number | null, number | null, number[] | null,
  number | null, string | null, boolean, number,
]

export function normalizeFlightId(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, '').toUpperCase()
}

export function isWithinFlightTrackingWindow(
  departure: string | null,
  arrival: string | null,
  itineraryStatus: string,
  now: number,
  windowMs = 6 * 60 * 60 * 1000,
) {
  const departureMs = departure ? new Date(departure).getTime() : Number.NaN
  const arrivalMs = arrival ? new Date(arrival).getTime() : Number.NaN
  if (Number.isFinite(departureMs) && now < departureMs - windowMs) return false
  if (Number.isFinite(arrivalMs) && now > arrivalMs + windowMs) return false
  if (!Number.isFinite(departureMs) && !Number.isFinite(arrivalMs) && itineraryStatus !== 'active') return false
  return true
}

export function findOpenSkyFlightState(
  states: OpenSkyVector[],
  identifier: { icao24: string | null; callsign: string | null },
) {
  const expectedCallsign = normalizeFlightId(identifier.callsign)
  return states
    .filter((state) => identifier.icao24
      ? state[0]?.toLowerCase() === identifier.icao24.toLowerCase()
      : Boolean(expectedCallsign && normalizeFlightId(state[1]) === expectedCallsign))
    .sort((a, b) => b[4] - a[4])[0] ?? null
}
