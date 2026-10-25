export const OFFICER_PRESENCE_REFRESH_MS = 30_000
export const OFFICER_ONLINE_WINDOW_MS = 120_000

type OfficerPresence = {
  is_online?: boolean | null
  last_seen?: string | null
  activation_status?: string | null
  is_active?: boolean | null
}

/** A live heartbeat, not GPS sharing or assignment to a programme, means online. */
export function isOfficerOnline(officer: OfficerPresence, now = Date.now()): boolean {
  if (officer.is_online !== true || officer.activation_status !== 'active' || officer.is_active === false) return false
  if (!officer.last_seen) return false
  const age = now - Date.parse(officer.last_seen)
  return Number.isFinite(age) && age >= 0 && age <= OFFICER_ONLINE_WINDOW_MS
}
