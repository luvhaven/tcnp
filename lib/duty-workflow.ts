export type DOReturnDestination = 'nest' | 'eagle_square'
export type DOCompletionReason = 'nest_settled' | 'flight_departed' | 'flight_landed' | 'papa_departed'

export const DO_COMPLETION_LABELS: Record<DOCompletionReason, string> = {
  nest_settled: 'Papa is settled at the Nest',
  flight_departed: 'Papa’s flight has taken off',
  flight_landed: 'Papa’s flight has landed',
  papa_departed: 'Papa has left in his own transport',
}

type DutyJourney = { origin?: string | null; destination?: string | null; assigned_theatre_id?: string | null; journey_type?: string | null }

/** Papa came in his own transport, so the DO has no return escort to run. */
export function isSelfArrival(journey: { origin?: string | null; journey_type?: string | null }): boolean {
  return journey.journey_type === 'self_arrival' || /self[-\s]?driven/i.test(journey.origin || '')
}

export function isTheatreDuty(journey: { destination?: string | null; assigned_theatre_id?: string | null }): boolean {
  const destination = journey.destination?.toLowerCase() || ''
  if (/nest|hotel|eagle|airport/.test(destination)) return false
  return Boolean(journey.assigned_theatre_id || /theatre|theater|venue|church/.test(destination))
}

/** A Theatre duty needs a return escort to the Nest or Eagle Square, unless Papa came by himself. */
export function needsReturnEscort(journey: DutyJourney): boolean {
  return isTheatreDuty(journey) && !isSelfArrival(journey)
}

export function dutyCompletionReasons(journey: DutyJourney, returnDestination?: DOReturnDestination | null): DOCompletionReason[] {
  if (returnDestination === 'nest') return ['nest_settled']
  if (returnDestination === 'eagle_square') return ['flight_departed', 'flight_landed']
  if (isSelfArrival(journey)) return ['papa_departed']
  if (isTheatreDuty(journey)) return []
  if (/nest|hotel/i.test(journey.destination || '')) return ['nest_settled']
  if (/eagle|airport/i.test(journey.destination || '')) return ['flight_departed', 'flight_landed']
  return ['nest_settled', 'flight_departed', 'flight_landed']
}
