export type DOReturnDestination = 'nest' | 'eagle_square'
export type DOCompletionReason = 'nest_settled' | 'flight_departed' | 'flight_landed'

export const DO_COMPLETION_LABELS: Record<DOCompletionReason, string> = {
  nest_settled: 'Papa is settled at the Nest',
  flight_departed: 'Papa’s flight has taken off',
  flight_landed: 'Papa’s flight has landed',
}

export function isTheatreDuty(journey: { destination?: string | null; assigned_theatre_id?: string | null }): boolean {
  const destination = journey.destination?.toLowerCase() || ''
  if (/nest|hotel|eagle|airport/.test(destination)) return false
  return Boolean(journey.assigned_theatre_id || /theatre|theater|venue|church/.test(destination))
}

export function dutyCompletionReasons(journey: { destination?: string | null; assigned_theatre_id?: string | null }, returnDestination?: DOReturnDestination | null): DOCompletionReason[] {
  if (returnDestination === 'nest') return ['nest_settled']
  if (returnDestination === 'eagle_square') return ['flight_departed', 'flight_landed']
  if (isTheatreDuty(journey)) return []
  if (/nest|hotel/i.test(journey.destination || '')) return ['nest_settled']
  if (/eagle|airport/i.test(journey.destination || '')) return ['flight_departed', 'flight_landed']
  return ['nest_settled', 'flight_departed', 'flight_landed']
}
