export const MISSION_AUDIENCES = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Males only' },
  { value: 'female', label: 'Females only' },
  { value: 'swift', label: 'Team Swift only' },
  { value: 'strength', label: 'Team Strength only' },
  { value: 'wisdom', label: 'Team Wisdom only' },
] as const

export type MissionAudience = typeof MISSION_AUDIENCES[number]['value']

export function isMissionAudience(value: unknown): value is MissionAudience {
  return MISSION_AUDIENCES.some(audience => audience.value === value)
}
