"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { cn, oscarToRole } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount'
import { useUnreadAssignments } from '@/hooks/useUnreadAssignments'
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
  ChevronLeft,
  Landmark,
  BookOpen,
  ClipboardList,
  KeyRound,
  Camera,
  Shirt,
  UtensilsCrossed,
  Compass,
  Banknote,
  GraduationCap,
  Radar,
} from "lucide-react"


type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> }
type NavSection = { label: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "My Operations", href: "/my-operations", icon: Navigation },
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
      { name: "Hospitality", href: "/hospitality", icon: Compass },
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

const ALL_NAV = NAV_SECTIONS.flatMap(s => s.items)

/** Pages every authenticated user always sees */
const BASE_HREFS = [
  "/dashboard", "/my-operations", "/chat", "/programs", "/guide",
  "/training", "/compliance", "/welfare", "/hospitality",
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
  tango_oscar: ["/command", "/tango"],
  head_tango_oscar: ["/command", "/tango"],
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
  hospitality_oscar: ["/hospitality"],
  head_hospitality_oscar: ["/hospitality"],
  // Echo is no longer a standalone unit — legacy echo officers keep base access only
  echo_oscar: [],
  head_echo_oscar: [],
}

const ADMIN_ROLES = new Set([
  "super_admin", "dev_admin", "admin",
  "captain", "vice_captain", "head_of_command", "head_of_operations", "command",
  "hod", "hop",
])

function getVisibleNav(role: string | null, oscar?: string | null): typeof ALL_NAV {
  if (!role) return ALL_NAV.filter(n => BASE_HREFS.includes(n.href))
  if (ADMIN_ROLES.has(role)) return ALL_NAV

  // Resolve extra pages from the assigned role (may be delta_oscar)
  const roleExtra = ROLE_EXTRA[role] ?? []

  // Resolve extra pages from the permanent Oscar unit (even when role=delta_oscar)
  const oscarRole = oscarToRole(oscar)
  const oscarExtra = oscarRole && oscarRole !== role ? (ROLE_EXTRA[oscarRole] ?? []) : []

  // Union both sets so base Oscar pages are always visible
  const allowed = new Set([...BASE_HREFS, ...roleExtra, ...oscarExtra])
  return ALL_NAV.filter(n => allowed.has(n.href))
}

type SidebarProps = {
  isMobile?: boolean
  onClose?: () => void
}

// ─── Singleton client ───
const supabase = createClient()

export function Sidebar({ isMobile = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const setCollapsed = (value: boolean) => {
    setCollapsedState(value)
    try { window.localStorage.setItem('sidebar-collapsed', String(value)) } catch (_) { }
  }
  const { count: unreadChat } = useUnreadChatCount()
  const { count: unreadAssignments } = useUnreadAssignments()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userOscar, setUserOscar] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setCurrentUser(null); setUserRole(null); return }
        setCurrentUser(user.id)
        const { data: profile, error } = await supabase
          .from('users')
          .select('role, oscar')
          .eq('id', user.id)
          .single<{ role: string | null; oscar: string | null }>()
        if (!error && profile) {
          setUserRole(profile.role ?? null)
          setUserOscar(profile.oscar ?? null)
        }
      } catch (err) {
        console.warn('Sidebar user load failed:', err)
      }
    }
    void loadUser()
  }, [supabase])

  const visibleSections = useMemo(() => {
    const allowed = new Set(getVisibleNav(userRole, userOscar).map(i => i.href))
    return NAV_SECTIONS
      .map(section => ({ ...section, items: section.items.filter(i => allowed.has(i.href)) }))
      .filter(section => section.items.length > 0)
  }, [userRole, userOscar])

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-border/60 bg-gradient-to-b from-background via-card/95 to-background/95 shadow-xl backdrop-blur-sm transition-[width] duration-300 ease-in-out",
        isMobile ? "w-64" : collapsed ? "w-[76px]" : "w-[248px]"
      )}
    >
      {/* Desktop collapse toggle — aligned with Dashboard nav item */}
      {!isMobile && (
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[5.75rem] z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground nav:flex"
        >
          <ChevronLeft
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-300",
              collapsed && "rotate-180"
            )}
          />
        </button>
      )}

      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        <Link
          href="/dashboard"
          className="flex items-center justify-start gap-2 overflow-hidden"
          onClick={isMobile ? onClose : undefined}
        >
          <div className="relative h-8 w-8 flex-shrink-0">
            <Image src="/tcnp_logo.png" alt="The Covenant Nation" fill sizes="32px" className="object-contain" priority />
          </div>
          <div className={cn(
            "flex flex-col transition-all duration-300 overflow-hidden whitespace-nowrap",
            collapsed && !isMobile ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            <span className="text-sm font-semibold truncate leading-tight">TCN Protocol</span>
            <span className="text-xs text-muted-foreground truncate leading-tight">Central Application</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto p-2">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-3")}>
            {/* Section label — divider line when collapsed */}
            {collapsed && !isMobile ? (
              sectionIndex > 0 && <div className="mx-3 mb-2 border-t border-border/60" />
            ) : (
              // 10px at muted-foreground/70 measured 2.72:1 — under AA. Full
              // muted-foreground at 11px clears it while staying a quiet label.
              <p className="select-none px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item, index) => {
          const isActive = pathname === item.href
          const isChat = item.name === "Team Chat"
          const isOps = item.name === "My Operations"
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (sectionIndex * 2 + index) * 0.03, duration: 0.2, ease: "easeOut" }}
            >
              <Link
                href={item.href}
                onClick={isMobile ? onClose : undefined}
                className={cn(
                  "relative flex items-center justify-start px-3 py-2 text-sm font-medium rounded-r-lg rounded-l-none gap-3 mr-1 transition-colors duration-150 border-l-[3px] border-transparent",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
                title={collapsed && !isMobile ? item.name : undefined}
              >
                {/* Active pill glides between items via shared layout animation */}
                {isActive && (
                  <motion.span
                    layoutId={isMobile ? "sidebar-active-mobile" : "sidebar-active"}
                    className="absolute inset-0 -left-[3px] rounded-r-lg border-l-[3px] border-primary bg-primary/10 shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    aria-hidden
                  />
                )}
                <div className="relative z-10 flex-shrink-0">
                  <item.icon className="h-5 w-5" />
                  {/* Collapsed badge dots */}
                  {isChat && unreadChat > 0 && collapsed && !isMobile && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive motion-safe:animate-pulse" />
                  )}
                  {isOps && unreadAssignments > 0 && collapsed && !isMobile && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  )}
                </div>
                <span className={cn(
                  "relative z-10 flex items-center justify-between w-full transition-all duration-300 overflow-hidden whitespace-nowrap",
                  collapsed && !isMobile ? "w-0 opacity-0" : "w-auto opacity-100"
                )}>
                  <span>{item.name}</span>
                  <span className="flex gap-1 ml-auto">
                    {isChat && unreadChat > 0 && !(collapsed && !isMobile) && (
                      // bg-red-500 previously overrode the destructive variant here,
                      // pinning white text at 3.76:1 — let the token through instead
                      <Badge variant="destructive" className="font-semibold shadow-elevation">
                        {unreadChat > 99 ? '99+' : unreadChat}
                      </Badge>
                    )}
                    {isOps && unreadAssignments > 0 && !(collapsed && !isMobile) && (
                      <Badge className="bg-primary-text font-semibold text-white shadow-elevation">
                        {unreadAssignments > 9 ? '9+' : unreadAssignments}
                      </Badge>
                    )}
                  </span>
                </span>
              </Link>
            </motion.div>
          )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!(collapsed && !isMobile) && (
        <div className="mt-auto border-t border-border/50 bg-background/50 p-4 backdrop-blur-sm">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Version 3.1.7</span>
            <span>&copy; {new Date().getFullYear()} TCNP</span>
          </div>
        </div>
      )}
    </div>
  )
}
