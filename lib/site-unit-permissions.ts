/**
 * Which buttons the site unit pages (November Den, November Nest, Welfare,
 * Serial, Training) may show, as pure functions of the one unit-access rule.
 *
 * Every function mirrors the RLS policy that will judge the write, so a
 * button only shows when the database will accept it. The policies live in
 * supabase/migrations/20261116170000_unit_access_single_rule.sql (and the
 * older Den, Nest, Welfare and Training migrations they sit beside).
 *
 *   isCommand      ↔ is_admin() / has_any_role(<the 8 admin and Command roles>)
 *   canCoordinate  ↔ can_coordinate_unit(slug)   (head, sub_lead or platform admin)
 *   canManage      ↔ can_manage_unit(slug)       (head or platform admin)
 *   work flags     ↔ can_work_unit_programme(slug, programme)
 *
 * The work flags come from the database (useCanWorkUnitProgramme), because
 * only it knows whether the officer is active on the programme and holds a
 * grant. RLS stays the final authority for every write.
 */
import type { UnitAccess } from './unit-access'

export type SiteAccess = Pick<UnitAccess, 'isPlatformAdmin' | 'isCommand' | 'isMember' | 'canCoordinate' | 'canManage'>

/** Programme work the database confirmed for the selected programme. */
export type ProgrammeWork = {
  den?: boolean
  nest?: boolean
  welfare?: boolean
}

// ─── Briefings ──────────────────────────────────────────────────────────────

const BRIEFING_KEYS = {
  november_den: { coordinator: 'head_noscar_den', member: 'noscar_den' },
  november_nest: { coordinator: 'head_noscar_nest', member: 'noscar_nest' },
} as const

/**
 * The Papa briefing config key for a unit, from the officer's level in it:
 * coordinators (head, sub-lead, platform admin) get the editable config, plain
 * members the read-only one, everyone else none. The role-update API accepts
 * the same coordinators (it also accepts programme workers, who see the
 * read-only view here because a briefing spans programmes).
 */
export function briefingConfigKey(unit: keyof typeof BRIEFING_KEYS, access: Pick<SiteAccess, 'isMember' | 'canCoordinate'>): string | null {
  const keys = BRIEFING_KEYS[unit]
  if (access.canCoordinate) return keys.coordinator
  if (access.isMember) return keys.member
  return null
}

// ─── Shared Den / Nest / Welfare writes ─────────────────────────────────────

/** vendors insert/update: can_edit_vendors(). */
export function canEditVendors(units: { den: SiteAccess; nest: SiteAccess; welfare: SiteAccess }): boolean {
  return units.den.isCommand || units.den.canCoordinate || units.welfare.canCoordinate || units.nest.canManage
}

/** vendors delete: Command + the Den, Nest or Welfare head. */
export function canDeleteVendors(units: { den: SiteAccess; nest: SiteAccess; welfare: SiteAccess }): boolean {
  return units.den.isCommand || units.den.canManage || units.nest.canManage || units.welfare.canManage
}

/** program_menus insert/update for the selected programme. */
export function canEditMenus(units: { den: SiteAccess; nest: SiteAccess; welfare: SiteAccess }, work: ProgrammeWork): boolean {
  return canEditVendors(units) || work.den === true || work.welfare === true
}

/** program_menus delete: Command + the Den, Nest or Welfare head. */
export function canDeleteMenus(units: { den: SiteAccess; nest: SiteAccess; welfare: SiteAccess }): boolean {
  return canDeleteVendors(units)
}

/** papa_meal_orders insert/update for the selected programme (incl. Den floor grants). */
export function canTakeMealOrders(units: { den: SiteAccess; nest: SiteAccess }, work: ProgrammeWork): boolean {
  return units.den.isCommand || units.den.canCoordinate || units.nest.canCoordinate || work.den === true || work.nest === true
}

/**
 * noscar_assignments (Den and Nest postings). This policy keeps its own short
 * Command list (super_admin, admin, captain, head_of_command,
 * head_of_operations); the other platform admins pass through
 * can_coordinate_unit, and the 'command' role is not in it.
 *
 * Scoped by the posting's site: a Nest hotel (nests.type = 'nest') is staffed
 * only by Nest coordinators or Nest programme workers, a Den lounge
 * (type = 'den') only by the Den equivalents. A grant from one unit's head
 * never reaches the other unit's sites.
 */
const ASSIGNMENT_ROLES: ReadonlySet<string> = new Set(['super_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations'])

export function canManagePostings(
  role: string | null | undefined,
  /** The unit that owns the site: Nest for hotels, Den for lounges. */
  siteUnit: SiteAccess,
  /** can_work_unit_programme(<that unit>, <the posting's programme>). */
  canWorkSiteProgramme: boolean,
): boolean {
  return ASSIGNMENT_ROLES.has(role ?? '')
    || siteUnit.isPlatformAdmin
    || siteUnit.canCoordinate
    || canWorkSiteProgramme
}

// ─── Den ────────────────────────────────────────────────────────────────────

/** nests rows of type 'den': the Den head, plus Command ("Admins have full access"). */
export function canManageDenLocations(den: SiteAccess): boolean {
  return den.canManage || den.isCommand
}

// ─── Nest ───────────────────────────────────────────────────────────────────

/** nests rows of type 'nest' (hotels): the Nest head, plus Command. */
export function canManageHotels(nest: SiteAccess): boolean {
  return nest.canManage || nest.isCommand
}

/** nest_comfort_logs insert: own row AND (is_admin() OR Nest member). Den members no longer log it. */
export function canLogComfortCheck(nest: SiteAccess): boolean {
  return nest.isMember || nest.isCommand
}

/** hospitality_places and the hospitality-media bucket: can_manage_unit('november_nest') only. */
export function canEditGuestExperiences(nest: SiteAccess): boolean {
  return nest.canManage
}

/** papa_accommodations insert/update for the selected programme. */
export function canEditAccommodations(nest: SiteAccess, work: ProgrammeWork): boolean {
  return nest.isCommand || nest.canCoordinate || work.nest === true
}

/** papa_accommodations delete: Command + the Nest head. */
export function canDeleteAccommodations(nest: SiteAccess): boolean {
  return nest.isCommand || nest.canManage
}

// ─── Welfare ────────────────────────────────────────────────────────────────

/** POST /api/welfare/food-ready, which applies the same rule for the chosen programme. */
export function canSoundFoodAlarm(units: { den: SiteAccess; welfare: SiteAccess }, work: ProgrammeWork): boolean {
  return units.welfare.isCommand || units.welfare.canCoordinate || units.den.canCoordinate
    || work.welfare === true || work.den === true
}

/** Could this officer ever sound the alarm (a member who may be given programme work)? */
export function mayBeFoodAlarmWorker(units: { den: SiteAccess; welfare: SiteAccess }): boolean {
  return units.welfare.isMember || units.den.isMember
}

/** get_welfare_directory_safe() returns rows only for can_manage_unit('welfare'). */
export function canSeeWelfareDirectory(welfare: SiteAccess): boolean {
  return welfare.canManage
}

/** Prayer campaigns, care cases and celebrations: can_manage_unit('welfare'). */
export function canManageWelfareOperations(welfare: SiteAccess): boolean {
  return welfare.canManage
}

// ─── Serial ─────────────────────────────────────────────────────────────────

export type SerialPermissions = {
  canView: boolean
  canUpload: boolean
  /** Status and Instagram link on this asset. */
  canEditAsset: (asset: { uploaded_by: string | null }) => boolean
  canDelete: boolean
}

/**
 * media_assets and the private serial-media bucket:
 *   read    Command + Serial member
 *   insert  Command + Serial member (own uploaded_by)
 *   update  Command + Serial coordinator (any) + Serial member (own)
 *   delete  Command + Serial head
 */
export function serialPermissions(serial: SiteAccess, userId: string | null | undefined): SerialPermissions {
  const canView = serial.isMember || serial.isCommand
  return {
    canView,
    canUpload: canView,
    canEditAsset: asset => serial.isCommand || serial.canCoordinate
      || (serial.isMember && Boolean(userId) && asset.uploaded_by === userId),
    canDelete: serial.isCommand || serial.canManage,
  }
}

/** Signed URLs for the private serial-media bucket: one hour, refreshed ten minutes early. */
export const SERIAL_SIGNED_URL_SECONDS = 60 * 60
export const SERIAL_SIGNED_URL_REFRESH_MS = 50 * 60 * 1000
/** createSignedUrls takes a list; keep each request small. */
export const SERIAL_SIGNED_URL_BATCH = 100

/** Distinct, sorted storage paths (a stable query key and the batches to sign). */
export function serialStoragePaths(assets: readonly { storage_path: string | null | undefined }[]): string[] {
  return [...new Set(assets.map(asset => asset.storage_path).filter((path): path is string => Boolean(path)))].sort()
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/** path → signed URL from createSignedUrls rows; rows with an error or no URL are left out. */
export function signedUrlMap(
  rows: readonly { path: string | null; signedUrl: string | null; error: string | null }[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    if (row.path && row.signedUrl && !row.error) map[row.path] = row.signedUrl
  }
  return map
}

// ─── Training ───────────────────────────────────────────────────────────────

/** Every Training write (schedules, courses, attendance, evaluations, Training-managed documents). */
export function canManageTraining(training: SiteAccess): boolean {
  return training.canManage
}

// ─── Programme notice ───────────────────────────────────────────────────────

/**
 * What to tell a unit member who cannot do programme work right now, or null
 * when there is nothing to say (Command, coordinators, non-members, or the
 * member can already work it).
 */
export function programmeWorkNotice(input: {
  access: SiteAccess
  programmeSelected: boolean
  /** null while unknown. */
  activeOnProgramme: boolean | null
  canWork: boolean
  /** The programme-work check is still answering (hold the notice). */
  workLoading?: boolean
  /** The programme-work check failed (do not blame the head). */
  workFailed?: boolean
  /** e.g. "take orders or publish menus". */
  work: string
  /** e.g. "the Den head". */
  granter: string
}): string | null {
  const { access } = input
  if (access.isCommand || access.canCoordinate || !access.isMember || input.canWork) return null
  if (!input.programmeSelected) return `Choose a programme to ${input.work}. Programme work is given one programme at a time.`
  if (input.workLoading) return null
  if (input.workFailed) return 'Could not check your programme work. Refresh the page to try again.'
  if (input.activeOnProgramme === null) return null
  if (!input.activeOnProgramme) {
    return `You are not active on this programme yet, so you can view but not ${input.work}. Ask Command to add you to the programme.`
  }
  return `You are active on this programme, but ${input.granter} has not given you this work yet.`
}
