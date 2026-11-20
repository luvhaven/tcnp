/**
 * The one unit-access rule, as a pure function the client and server share.
 *
 * Source of truth is an active unit_memberships row (member | sub_lead | head)
 * in an active unit. users.role unit roles and the users.oscar label grant
 * nothing on their own: the legacy sync trigger turns them into membership
 * rows, and only those rows count. A 'viewer' who is a member of a unit is
 * treated exactly like any other member of it.
 *
 * Mirrors the SQL helpers in supabase/migrations/20261116170000_unit_access_single_rule.sql:
 *   isPlatformAdmin  ↔ is_platform_admin()      (rank >= 80 or has_admin_access)
 *   isCommand        ↔ is_admin()               (Command oversight; includes platform admins)
 *   isMember         ↔ is_unit_member(slug)
 *   canCoordinate    ↔ can_coordinate_unit(slug) (head or sub_lead, or platform admin)
 *   canManage        ↔ can_manage_unit(slug)     (head, or platform admin)
 *   canWorkUnitProgramme ↔ can_work_unit_programme(slug, programme)
 * RLS stays the final authority for every write.
 */

export const UNIT_SLUGS = [
  'alpha',
  'command',
  'compliance',
  'echo',
  'november_den',
  'november_nest',
  'serial',
  'tango',
  'training',
  'victor',
  'welfare',
] as const

export type UnitSlug = (typeof UNIT_SLUGS)[number]

export type UnitAccessLevel = 'member' | 'sub_lead' | 'head'

/** One active membership, as the client reads it (unit slug + level). */
export type UnitMembership = {
  slug: string
  access_level: UnitAccessLevel
  /** Optional; rows whose status is present and not 'active' are ignored. */
  status?: string | null
}

export type UnitAccess = {
  isPlatformAdmin: boolean
  isCommand: boolean
  isMember: boolean
  isSubLead: boolean
  isHead: boolean
  canCoordinate: boolean
  canManage: boolean
}

export type UnitAccessViewer = {
  role?: string | null
  hasAdminAccess?: boolean | null
}

/** Roles SQL is_admin() accepts (with an active account). */
const COMMAND_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
  'dev_admin',
  'admin',
  'captain',
  'vice_captain',
  'head_of_operations',
  'head_of_command',
  'command',
])

/** Roles SQL current_user_platform_rank() puts at 80 or above. */
const PLATFORM_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
  'dev_admin',
  'admin',
  'captain',
  'vice_captain',
])

/** Client mirror of SQL is_platform_admin(). */
export function isPlatformAdminAuthority(role?: string | null, hasAdminAccess?: boolean | null): boolean {
  return hasAdminAccess === true || PLATFORM_ROLES.has(role ?? '')
}

/**
 * Client mirror of SQL is_admin() — platform admins plus Command (command,
 * head_of_command, head_of_operations). Unlike lib/utils isAdmin it does not
 * count the client-only hod / hop ranks, because the database does not.
 */
export function isCommandAuthority(role?: string | null, hasAdminAccess?: boolean | null): boolean {
  return hasAdminAccess === true || COMMAND_ROLES.has(role ?? '')
}

function activeMembership(memberships: readonly UnitMembership[] | null | undefined, slug: string) {
  return (memberships ?? []).find(row => row.slug === slug && (row.status == null || row.status === 'active')) ?? null
}

/** What the viewer may do in one unit. */
export function unitAccess(
  memberships: readonly UnitMembership[] | null | undefined,
  slug: string,
  viewer: UnitAccessViewer = {},
): UnitAccess {
  const isPlatformAdmin = isPlatformAdminAuthority(viewer.role, viewer.hasAdminAccess)
  const isCommand = isCommandAuthority(viewer.role, viewer.hasAdminAccess)
  const membership = activeMembership(memberships, slug)
  const isHead = membership?.access_level === 'head'
  const isSubLead = membership?.access_level === 'sub_lead'
  return {
    isPlatformAdmin,
    isCommand,
    isMember: Boolean(membership),
    isSubLead,
    isHead,
    canCoordinate: isPlatformAdmin || isHead || isSubLead,
    canManage: isPlatformAdmin || isHead,
  }
}

/**
 * Programme work in a unit (taking orders, publishing menus, check-ins):
 * member AND active on the programme AND (head/sub_lead OR a head-issued
 * grant such as a Den floor grant). The two facts come from the server
 * (is_program_active_officer, den_floor_grants); prefer the
 * can_work_unit_programme RPC (useCanWorkUnitProgramme) when you do not
 * already hold them.
 */
export function canWorkUnitProgramme(
  access: Pick<UnitAccess, 'isPlatformAdmin' | 'isMember' | 'canCoordinate'>,
  facts: { activeOnProgramme: boolean; hasGrant?: boolean },
): boolean {
  if (access.isPlatformAdmin) return true
  return access.isMember && facts.activeOnProgramme && (access.canCoordinate || facts.hasGrant === true)
}

type MembershipRow = { access_level: UnitAccessLevel; status: string | null; units: { slug: string } | null }

/**
 * Reads one user's active memberships in active units. Pass a Supabase client
 * that carries the caller's own session (RLS lets a user read their own rows),
 * never the service-role client. Used by useMyUnitMemberships and API routes.
 */
export async function fetchActiveUnitMemberships(
  client: { from: (table: string) => any },
  userId: string,
): Promise<{ memberships: UnitMembership[]; error: unknown }> {
  const { data, error } = await client
    .from('unit_memberships')
    .select('access_level, status, units!inner(slug, is_active)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('units.is_active', true)
  if (error) return { memberships: [], error }
  const memberships = ((data ?? []) as MembershipRow[])
    .filter(row => row.units?.slug)
    .map(row => ({ slug: row.units!.slug, access_level: row.access_level, status: row.status }))
  return { memberships, error: null }
}

/**
 * Plain unit Oscar label for each unit role key (head and member alike). An
 * Oscar is a display label: it names the officer's unit and never carries a
 * "head" marker, because headship comes from the head role or a curated
 * membership row, not from Oscar text.
 */
const UNIT_OSCAR_LABEL_BY_ROLE: Readonly<Record<string, string>> = {
  command: 'Command',
  head_of_command: 'Command',
  alpha_oscar: 'Alpha Oscar',
  head_alpha_oscar: 'Alpha Oscar',
  tango_oscar: 'Tango Oscar',
  head_tango_oscar: 'Tango Oscar',
  victor_oscar: 'Victor Oscar',
  head_victor_oscar: 'Victor Oscar',
  noscar_den: 'November (Den)',
  head_noscar_den: 'November (Den)',
  noscar_nest: 'November (Nest)',
  head_noscar_nest: 'November (Nest)',
  november_oscar: 'November Oscar',
  serial_oscar: 'Serial Oscar',
  head_serial_oscar: 'Serial Oscar',
  sierra_oscar: 'Serial Oscar',
  head_sierra_oscar: 'Serial Oscar',
  compliance_oscar: 'Compliance Oscar',
  head_compliance_oscar: 'Compliance Oscar',
  welfare_oscar: 'Welfare Oscar',
  head_welfare_oscar: 'Welfare Oscar',
  training_oscar: 'Training Oscar',
  head_training_oscar: 'Training Oscar',
  echo_oscar: 'Echo Oscar',
  head_echo_oscar: 'Echo Oscar',
}

/** The plain unit label for a unit role key, or null for non-unit roles. */
export function unitOscarLabelForRole(role: string | null | undefined): string | null {
  return UNIT_OSCAR_LABEL_BY_ROLE[(role ?? '').trim().toLowerCase()] ?? null
}

const HEAD_MARKER = /\bhead\b|head[_\s,]/i
/** Same Command values SQL legacy_matches_unit('command', ...) accepts. */
const COMMAND_OSCAR = /^(head[\s_,]*(of[\s_]+)?)?command([\s_]+(centre|center))?$/i

/**
 * Removes any "head" marker from an Oscar while keeping the unit it names, so
 * the label never reads as a unit head. A raw role key ('head_alpha_oscar') or
 * a "Head ..." label becomes the plain unit label ('Alpha Oscar'); an Oscar
 * without a head marker, or one that names no unit ('Head of Operations'), is
 * returned unchanged. `resolveRole` is the label → role mapping (lib/utils
 * oscarToRole), passed in to keep this module pure.
 */
export function plainUnitOscar(
  oscar: string | null | undefined,
  resolveRole: (oscar: string) => string | null,
): string | null {
  const trimmed = (oscar ?? '').trim()
  if (!trimmed) return null
  const direct = unitOscarLabelForRole(trimmed)
  if (direct) return direct
  if (!HEAD_MARKER.test(trimmed)) return trimmed
  if (COMMAND_OSCAR.test(trimmed)) return 'Command'
  const withoutHead = trimmed.replace(/head[\s_,]*(of[\s_]+)?/i, '').trim()
  return unitOscarLabelForRole(resolveRole(trimmed))
    ?? (withoutHead ? unitOscarLabelForRole(resolveRole(withoutHead)) : null)
    ?? trimmed
}

/** Unit slugs from active membership rows (for navigation). */
export function memberUnitSlugs(memberships: readonly UnitMembership[] | null | undefined): string[] {
  return Array.from(new Set((memberships ?? [])
    .filter(row => row.status == null || row.status === 'active')
    .map(row => row.slug)
    .filter(Boolean)))
}
