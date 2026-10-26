export const OFFICER_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'captain', label: 'Captain' },
  { value: 'vice_captain', label: 'Vice Captain' },
  { value: 'head_of_operations', label: 'Head of Operations' },
  { value: 'head_of_command', label: 'Head of Command' },
  { value: 'command', label: 'Command' },
  { value: 'head_tango_oscar', label: 'Head, Tango Oscar' },
  { value: 'tango_oscar', label: 'Tango Oscar (TO)' },
  { value: 'head_alpha_oscar', label: 'Head, Alpha Oscar' },
  { value: 'alpha_oscar', label: 'Alpha Oscar (AO)' },
  { value: 'head_noscar_den', label: 'Head, November (Den)' },
  { value: 'noscar_den', label: 'November (Den)' },
  { value: 'head_noscar_nest', label: 'Head, November (Nest)' },
  { value: 'noscar_nest', label: 'November (Nest)' },
  { value: 'head_victor_oscar', label: 'Head, Victor Oscar' },
  { value: 'victor_oscar', label: 'Victor Oscar (VO)' },
  { value: 'delta_oscar', label: 'Delta Oscar (DO)' },
  { value: 'head_serial_oscar', label: 'Head, Serial Oscar' },
  { value: 'serial_oscar', label: 'Serial Oscar (SO)' },
  { value: 'head_compliance_oscar', label: 'Head, Compliance Oscar' },
  { value: 'compliance_oscar', label: 'Compliance Oscar (CO)' },
  { value: 'head_welfare_oscar', label: 'Head, Welfare Oscar' },
  { value: 'welfare_oscar', label: 'Welfare Oscar (WO)' },
  { value: 'head_training_oscar', label: 'Head, Training Oscar' },
  { value: 'training_oscar', label: 'Training Oscar' },
  { value: 'viewer', label: 'Viewer' },
]
const ROLE_ALIASES: Record<string, string> = {
  november_oscar: 'noscar_nest', hospitality_oscar: 'noscar_nest', head_hospitality_oscar: 'head_noscar_nest',
  sierra_oscar: 'serial_oscar', head_sierra_oscar: 'head_serial_oscar',
}
export const canonicalOfficerRole = (role: string) => ROLE_ALIASES[role] || role
export function officerRoleLabel(role?: string | null) {
  if (!role) return 'Officer'
  const canonical = canonicalOfficerRole(role)
  return OFFICER_ROLE_OPTIONS.find(option => option.value === canonical)?.label || ({ super_admin: 'Super Admin', dev_admin: 'Developer Admin', prof: 'Prof', duchess: 'Duchess' } as Record<string,string>)[canonical] || canonical.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
export const OFFICER_CATEGORIES = [
  { id: 'leadership', label: 'Leadership', roles: ['captain', 'vice_captain', 'prof', 'duchess'] },
  { id: 'command', label: 'Command Centre', roles: ['head_of_command', 'command', 'head_of_operations'] },
  { id: 'alpha', label: 'Alpha Oscar (AO)', roles: ['head_alpha_oscar', 'alpha_oscar'] },
  { id: 'tango', label: 'Tango Oscar (TO)', roles: ['head_tango_oscar', 'tango_oscar'] },
  { id: 'victor', label: 'Victor Oscar (VO)', roles: ['head_victor_oscar', 'victor_oscar'] },
  { id: 'november_nest', label: 'November (Nest)', roles: ['head_noscar_nest', 'noscar_nest'] },
  { id: 'november_den', label: 'November (Den)', roles: ['head_noscar_den', 'noscar_den'] },
  { id: 'delta', label: 'Delta Oscar (DO)', roles: ['delta_oscar'] },
  { id: 'serial', label: 'Serial Oscar (SO)', roles: ['head_serial_oscar', 'serial_oscar'] },
  { id: 'compliance', label: 'Compliance Oscar (CO)', roles: ['head_compliance_oscar', 'compliance_oscar'] },
  { id: 'welfare', label: 'Welfare Oscar (WO)', roles: ['head_welfare_oscar', 'welfare_oscar'] },
  { id: 'training', label: 'Training Oscar', roles: ['head_training_oscar', 'training_oscar'] },
  { id: 'legacy_echo', label: 'Echo (Legacy)', roles: ['head_echo_oscar', 'echo_oscar'] },
  { id: 'others', label: 'Administration & Viewers', roles: ['super_admin', 'admin', 'dev_admin', 'viewer'] },
]
export type DirectoryOfficer = { id: string; role: string; full_name: string | null; email: string; is_active: boolean; activation_status: string; current_title_id?: string | null; oscar?: string | null; phone?: string | null; team?: string | null; is_online?: boolean }
export function officerAccountStatus(officer: Pick<DirectoryOfficer, 'is_active' | 'activation_status'>): 'Active' | 'Pending' | 'Inactive' {
  return officer.activation_status === 'pending' ? 'Pending' : officer.is_active && officer.activation_status === 'active' ? 'Active' : 'Inactive'
}
export function leadershipSummary(officers: Pick<DirectoryOfficer, 'role'>[]) {
  const captains = officers.filter(officer => officer.role === 'captain').length
  const deputies = officers.filter(officer => officer.role === 'vice_captain').length
  return `${captains} ${captains === 1 ? 'Captain' : 'Captains'} · ${deputies} ${deputies === 1 ? 'Vice Captain' : 'Vice Captains'}`
}
export function filterDirectoryOfficers<T extends DirectoryOfficer>(officers: T[], filters: { status: string; role: string; team: string; search: string }) {
  const query = filters.search.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  return officers.filter(officer => {
    if (filters.status === 'online' && !officer.is_online) return false
    if (['active','pending','inactive'].includes(filters.status) && officerAccountStatus(officer).toLowerCase() !== filters.status) return false
    if (filters.role !== 'all' && canonicalOfficerRole(officer.role) !== canonicalOfficerRole(filters.role)) return false
    if (filters.team !== 'all' && officer.team !== filters.team) return false
    return !query || [officer.full_name, officer.email, officer.oscar, officer.phone, officer.team, officer.role, officerRoleLabel(officer.role)].some(value => (value || '').toLowerCase().replace(/[_\s]+/g, ' ').includes(query))
  })
}
export function toggleVisibleOfficerSelection(selected: string[], visible: string[], checked: boolean) {
  const visibleIds = new Set(visible)
  return checked ? [...new Set([...selected, ...visible])] : selected.filter(id => !visibleIds.has(id))
}
export function officerCSVCell(value: unknown) {
  let text = String(value ?? '')
  // Quote embedded delimiters and prevent untrusted profile data becoming a spreadsheet formula.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
