/**
 * Navigation config shared by the sidebar and the mobile bottom tab bar, so
 * both always agree on which destinations a role can see.
 */
import type { ComponentType } from "react"
import { canAccessCommandCentre, canApproveSignups, oscarToRole } from "@/lib/utils"
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
      { name: "Compliance", href: "/compliance", icon: Shirt },
      { name: "Welfare", href: "/welfare", icon: UtensilsCrossed },
    ],
  },
  {
    label: "Live Ops",
    items: [
      { name: "Team Chat", href: "/chat", icon: MessageCircle },
      { name: "Incidents", href: "/incidents", icon: AlertTriangle },
    ],
  },
  {
    label: "People",
    items: [
      { name: "Officers", href: "/officers", icon: UserCircle },
      { name: "Signup Approvals", href: "/approvals", icon: UserCheck },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { name: "Training", href: "/training", icon: GraduationCap },
      { name: "Guide", href: "/guide", icon: BookOpen },
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
  "/dashboard", "/my-operations", "/outbox", "/chat", "/programs", "/guide",
  "/training", "/compliance", "/welfare",
  "/profile", "/change-password",
]

/**
 * Role-scoped extra pages (beyond BASE_HREFS).
 * Admins/captain/command see everything — handled by a fallback.
 */
const ROLE_EXTRA: Record<string, string[]> = {
  delta_oscar: [],
  alpha_oscar: ["/alpha"],
  head_alpha_oscar: ["/alpha"],
  tango_oscar: ["/tango"],
  head_tango_oscar: ["/tango"],
  victor_oscar: ["/victor"],
  head_victor_oscar: ["/victor"],
  november_oscar: ["/nests", "/den"],
  head_noscar_den: ["/den"],
  noscar_den: ["/den"],
  head_noscar_nest: ["/nests"],
  noscar_nest: ["/nests"],
  serial_oscar: ["/serial"],
  head_serial_oscar: ["/serial"],
  compliance_oscar: ["/compliance"],
  head_compliance_oscar: ["/compliance"],
  welfare_oscar: ["/welfare"],
  head_welfare_oscar: ["/welfare"],
  training_oscar: ["/training"],
  head_training_oscar: ["/training"],
  // Echo is no longer a standalone unit — legacy echo officers keep base access only
  echo_oscar: [],
  head_echo_oscar: [],
}

const ADMIN_ROLES = new Set([
  "super_admin", "dev_admin", "admin",
  "captain", "vice_captain", "head_of_command", "head_of_operations", "command",
  "hod", "hop",
])

const UNIT_HREFS: Record<string, string[]> = {
  alpha: ["/alpha"],
  command: ["/command"],
  compliance: ["/compliance"],
  november_nest: ["/nests"],
  tango: ["/tango"],
  training: ["/training"],
  victor: ["/victor"],
  welfare: ["/welfare"],
}

export function getVisibleNav(role: string | null, oscar?: string | null, unitSlugs: string[] = []): typeof ALL_NAV {
  const oscarRole = oscarToRole(oscar)
  const effectiveRole = role === 'delta_oscar' ? (oscarRole || role) : (role || oscarRole)
  const membershipHrefs = unitSlugs.flatMap(slug => UNIT_HREFS[slug] ?? [])
  const canAccessCommand = Boolean(
    canAccessCommandCentre(role, oscar)
    || unitSlugs.includes('command')
  )

  if (!role) {
    const allowed = new Set([...BASE_HREFS, ...membershipHrefs])
    const base = ALL_NAV.filter(n => allowed.has(n.href))
    return canAccessCommand ? base : base.filter(n => n.href !== "/command")
  }

  let visibleList: typeof ALL_NAV

  if (ADMIN_ROLES.has(role) || (effectiveRole && ADMIN_ROLES.has(effectiveRole))) {
    visibleList = ALL_NAV
  } else {
    // Resolve extra pages from the assigned role (may be delta_oscar)
    const roleExtra = ROLE_EXTRA[role] ?? []

    // Resolve extra pages from the permanent Oscar unit (even when role=delta_oscar)
    const oscarExtra = oscarRole && oscarRole !== role ? (ROLE_EXTRA[oscarRole] ?? []) : []

    // Union both sets so base Oscar pages are always visible
    const allowed = new Set([...BASE_HREFS, ...roleExtra, ...oscarExtra, ...membershipHrefs])
    visibleList = ALL_NAV.filter(n => allowed.has(n.href))
  }

  // Command Centre includes platform administrators and Command members.
  if (!canAccessCommand) {
    visibleList = visibleList.filter(n => n.href !== "/command")
  }

  // Signup approvals: admins see everyone, unit heads see their own unit
  visibleList = canApproveSignups(role, oscar)
    ? (visibleList.some(n => n.href === "/approvals") ? visibleList : [...visibleList, ...ALL_NAV.filter(n => n.href === "/approvals")])
    : visibleList.filter(n => n.href !== "/approvals")

  return visibleList
}
