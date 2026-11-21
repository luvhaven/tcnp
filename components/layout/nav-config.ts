/**
 * Navigation config shared by the sidebar and the mobile bottom tab bar, so
 * both always agree on which destinations a role can see.
 */
import type { ComponentType } from "react"
import { canAccessCommandCentre, canApproveSignups, isPlatformAdministrator, type SignupApproverMembership } from "@/lib/utils"
import { canApproveProgramAdditions } from "@/lib/program-additions"
import { isCommandAuthority } from "@/lib/unit-access"
import {
  LayoutDashboard,
  Users,
  Car,
  Plane,
  Hotel,
  Home,
  AlertTriangle,
  Settings,
  FileText,
  UserCircle,
  Calendar,
  Volume2,
  Navigation,
  MessageCircle,
  Landmark,
  BookOpen,
  ClipboardList,
  KeyRound,
  Camera,
  Shirt,
  UtensilsCrossed,
  Banknote,
  GraduationCap,
  Route,
  ScrollText,
  Radar,
  UserCheck,
} from "lucide-react"

export type NavItem = { name: string; href: string; icon: ComponentType<{ className?: string }> }
export type NavSection = { label: string; items: NavItem[] }

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "My Operations", href: "/my-operations", icon: Navigation },
      { name: "Submission Outbox", href: "/outbox", icon: ClipboardList },
      { name: "Command", href: "/command", icon: Radar },
    ],
  },
  {
    label: "Planning",
    items: [
      { name: "Programs", href: "/programs", icon: Calendar },
      { name: "Papas", href: "/papas", icon: Users },
      { name: "Journeys", href: "/journeys", icon: Route },
    ],
  },
  {
    label: "Units",
    items: [
      { name: "Alpha", href: "/alpha", icon: Plane },
      { name: "Tango", href: "/tango", icon: Car },
      { name: "Victor", href: "/victor", icon: Landmark },
      { name: "November (Nest)", href: "/nests", icon: Hotel },
      { name: "November (Den)", href: "/den", icon: Home },
      { name: "Serial", href: "/serial", icon: Camera },
      { name: "Echo", href: "/echo", icon: Volume2 },
      { name: "Compliance", href: "/compliance", icon: Shirt },
      { name: "Welfare", href: "/welfare", icon: UtensilsCrossed },
      { name: "Training", href: "/training", icon: GraduationCap },
    ],
  },
  {
    label: "Live Ops",
    items: [
      { name: "Chat", href: "/chat", icon: MessageCircle },
      { name: "Incidents", href: "/incidents", icon: AlertTriangle },
    ],
  },
  {
    label: "People",
    items: [
      { name: "Officers", href: "/officers", icon: UserCircle },
      { name: "Approvals", href: "/approvals", icon: UserCheck },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { name: "Guide", href: "/guide", icon: BookOpen },
      { name: "SOP Manual", href: "/sop", icon: ScrollText },
    ],
  },
  {
    label: "Governance",
    items: [
      { name: "Finance", href: "/finance", icon: Banknote },
      { name: "Audit Log", href: "/audit-logs", icon: FileText },
      { name: "After-Op Reports", href: "/after-op-reports", icon: ClipboardList },
    ],
  },
  {
    label: "Account",
    items: [
      { name: "My Profile", href: "/profile", icon: UserCircle },
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "Change Password", href: "/change-password", icon: KeyRound },
    ],
  },
]

export const ALL_NAV = NAV_SECTIONS.flatMap(s => s.items)

/** Pages every authenticated user always sees */
const BASE_HREFS = [
  "/dashboard", "/my-operations", "/outbox", "/chat", "/programs", "/guide", "/sop",
  "/training", "/compliance", "/welfare",
  "/profile", "/change-password", "/settings",
]

/**
 * Who may open the Audit Log: platform admins and Command (SQL is_admin()),
 * the audience the audit_logs SELECT policy is aligned to. The client-only
 * hod / hop ranks are not admitted, because the database returns them nothing.
 */
export function canReadAuditLogs(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return isPlatformAdministrator(role, hasAdminAccess) || isCommandAuthority(role, hasAdminAccess)
}

/** Platform administrators and Command see every destination. */
const ADMIN_ROLES = new Set([
  "super_admin", "dev_admin", "admin",
  "captain", "vice_captain", "head_of_command", "head_of_operations", "command",
  "hod", "hop",
])

/**
 * Unit pages, shown from active unit membership only (lib/unit-access.ts).
 * users.role unit roles and the users.oscar label add nothing here: the legacy
 * sync trigger already turns them into membership rows. /command is never
 * opened by membership: it follows the Command page's own gate below.
 */
const UNIT_HREFS: Record<string, string[]> = {
  alpha: ["/alpha"],
  compliance: ["/compliance"],
  echo: ["/echo"],
  november_nest: ["/nests"],
  november_den: ["/den"],
  serial: ["/serial"],
  tango: ["/tango"],
  training: ["/training"],
  victor: ["/victor"],
  welfare: ["/welfare"],
}

/**
 * Destinations a user can see. `unitSlugs` are the user's active unit
 * memberships (useMyUnitMemberships). `_oscar` is ignored: users.oscar is a
 * display label and opens no page (it stays in the signature for callers).
 * `unitMemberships` (the same rows with their access level) makes Approvals
 * follow approvals/page.tsx: a platform admin, Command (isCommandAuthority), or
 * the head of a unit by membership. Without it (still loading, or the read
 * failed), headship falls back to the head role, as that page does.
 */
export function getVisibleNav(
  role: string | null,
  _oscar?: string | null,
  unitSlugs: string[] = [],
  hasAdminAccess?: boolean,
  unitMemberships?: readonly SignupApproverMembership[] | null,
): typeof ALL_NAV {
  const membershipHrefs = unitSlugs.flatMap(slug => UNIT_HREFS[slug] ?? [])
  // The same check command/page.tsx uses, so the link never bounces anyone.
  const canAccessCommand = canAccessCommandCentre(role, null, hasAdminAccess)

  if (!role) {
    const allowed = new Set([...BASE_HREFS, ...membershipHrefs])
    const base = ALL_NAV.filter(n => allowed.has(n.href))
    return canAccessCommand ? base : base.filter(n => n.href !== "/command")
  }

  let visibleList: typeof ALL_NAV

  if (hasAdminAccess || ADMIN_ROLES.has(role)) {
    visibleList = ALL_NAV
  } else {
    const allowed = new Set([...BASE_HREFS, ...membershipHrefs])
    visibleList = ALL_NAV.filter(n => allowed.has(n.href) || (n.href === "/command" && canAccessCommand))
  }

  // Audit Log: the page's own gate (canReadAuditLogs), so the link never bounces.
  if (!canReadAuditLogs(role, hasAdminAccess)) {
    visibleList = visibleList.filter(n => n.href !== "/audit-logs")
  }

  // Command Centre: platform administrators and Command roles only.
  if (!canAccessCommand) {
    visibleList = visibleList.filter(n => n.href !== "/command")
  }

  // The Officers page admits platform administrators only; Command and the
  // heads of operations would be sent straight back to the dashboard.
  if (!isPlatformAdministrator(role, hasAdminAccess)) {
    visibleList = visibleList.filter(n => n.href !== "/officers")
  }

  // Approvals: admins see everyone, unit heads (by head membership) see their
  // own unit's signups, Command reopens declined signups, and the Head of
  // Command approves programme additions. This is approvals/page.tsx's gate,
  // so the link never bounces.
  const canOpenApprovals = canApproveSignups(role, null, hasAdminAccess, unitMemberships)
    || isCommandAuthority(role, hasAdminAccess)
    || canApproveProgramAdditions(role, hasAdminAccess)
  visibleList = canOpenApprovals
    ? (visibleList.some(n => n.href === "/approvals") ? visibleList : [...visibleList, ...ALL_NAV.filter(n => n.href === "/approvals")])
    : visibleList.filter(n => n.href !== "/approvals")

  return visibleList
}
