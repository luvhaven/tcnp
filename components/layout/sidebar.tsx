"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { cn, oscarToRole } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount'
import { useUnreadAssignments } from '@/hooks/useUnreadAssignments'
import { ChangePasswordDialog } from '@/components/security/ChangePasswordDialog'
import {
  LayoutDashboard,
  Users,
  Car,
  Plane,
  Hotel,
  MapPin,
  AlertTriangle,
  Settings,
  FileText,
  UserCircle,
  Calendar,
  Navigation,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Activity,
  Route,
  Landmark,
  Volume2,
  BookOpen,
  Phone,
  ClipboardList,
} from "lucide-react"

const ALL_NAV = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "My Operations", href: "/my-operations", icon: Navigation },
  { name: "Ops Monitor", href: "/operations-monitor", icon: Activity },
  { name: "Programs", href: "/programs", icon: Calendar },
  { name: "Journeys", href: "/journeys", icon: Route },
  { name: "Papas", href: "/papas", icon: Users },
  { name: "Cheetahs", href: "/cheetahs", icon: Car },
  { name: "Echo", href: "/echo", icon: Volume2 },
  { name: "Eagle Operations", href: "/eagles", icon: Plane },
  { name: "Live Tracking", href: "/tracking/live", icon: MapPin },
  { name: "Team Chat", href: "/chat", icon: MessageCircle },
  { name: "Officers", href: "/officers", icon: UserCircle },
  { name: "NOscar", href: "/nests", icon: Hotel },
  { name: "Theatres", href: "/theatres", icon: Landmark },
  { name: "Incidents", href: "/incidents", icon: AlertTriangle },
  { name: "Audit Log", href: "/audit-logs", icon: FileText },
  { name: "Contacts", href: "/contacts", icon: Phone },
  { name: "Guide", href: "/guide", icon: BookOpen },
  { name: "SOP Manual", href: "/sop", icon: FileText },
  { name: "After-Op Reports", href: "/after-op-reports", icon: ClipboardList },
  { name: "Settings", href: "/settings", icon: Settings },
]

/** Pages every authenticated user always sees */
const BASE_HREFS = ["/dashboard", "/my-operations", "/chat", "/programs", "/guide", "/sop", "/contacts"]

/**
 * Role-scoped extra pages (beyond BASE_HREFS).
 * Admins/captain/command see everything — handled by a fallback.
 */
const ROLE_EXTRA: Record<string, string[]> = {
  delta_oscar: [],
  alpha_oscar: ["/eagles"],
  head_alpha_oscar: ["/eagles"],
  tango_oscar: ["/journeys", "/cheetahs", "/tracking/live"],
  head_tango_oscar: ["/journeys", "/cheetahs", "/tracking/live"],
  victor_oscar: ["/theatres"],
  head_victor_oscar: ["/theatres"],
  november_oscar: ["/nests"],
  head_noscar_den: ["/nests"],
  head_noscar_nest: ["/nests"],
  noscar_den: ["/nests"],
  noscar_nest: ["/nests"],
  echo_oscar: ["/echo"],
  head_echo_oscar: ["/echo"],
}

const ADMIN_ROLES = new Set([
  "super_admin", "dev_admin", "admin",
  "captain", "head_of_command", "head_of_operations", "command",
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
  const [collapsed, setCollapsed] = useState(false)
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

  const visibleNavigation = useMemo(() => getVisibleNav(userRole, userOscar), [userRole, userOscar])

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border/60 bg-gradient-to-b from-background via-card/95 to-background/95 shadow-xl backdrop-blur-sm transition-all duration-300 ease-in-out",
        isMobile ? "w-64" : collapsed ? "w-20" : "w-72"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4 justify-between">
        <Link
          href="/dashboard"
          className="flex items-center justify-start gap-2 overflow-hidden"
          onClick={isMobile ? onClose : undefined}
        >
          <div className="relative h-8 w-8 flex-shrink-0">
            <Image src="/tcnp_logo.png" alt="The Covenant Nation" fill className="object-contain" priority />
          </div>
          <div className={cn(
            "flex flex-col transition-all duration-300 overflow-hidden whitespace-nowrap",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            <span className="text-sm font-semibold">The Covenant Nation</span>
            <span className="text-xs text-muted-foreground">Journey Management</span>
          </div>
        </Link>
        {!isMobile && !collapsed && (
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-8 w-8 flex-shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Collapse toggle when collapsed */}
      {!isMobile && collapsed && (
        <div className="px-2 py-2 border-b flex justify-center">
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {visibleNavigation.map((item, index) => {
          const isActive = pathname === item.href
          const isChat = item.name === "Team Chat"
          const isOps = item.name === "My Operations"
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.04, duration: 0.2, ease: "easeOut" }}
            >
              <Link
                href={item.href}
                onClick={isMobile ? onClose : undefined}
                className={cn(
                  "relative flex items-center justify-start px-3 py-2 text-sm font-medium rounded-r-lg rounded-l-none gap-3 mr-1 transition-all duration-150 border-l-[3px]",
                  isActive
                    ? "text-primary border-primary bg-primary/10 shadow-sm"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/60 hover:border-muted-foreground/20"
                )}
                title={collapsed ? item.name : undefined}
              >
                <div className="relative flex-shrink-0">
                  <item.icon className="h-5 w-5" />
                  {/* Collapsed badge dots */}
                  {isChat && unreadChat > 0 && collapsed && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {isOps && unreadAssignments > 0 && collapsed && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  )}
                </div>
                <span className={cn(
                  "flex items-center justify-between w-full transition-all duration-300 overflow-hidden whitespace-nowrap",
                  collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                )}>
                  <span>{item.name}</span>
                  <span className="flex gap-1 ml-auto">
                    {isChat && unreadChat > 0 && !collapsed && (
                      <Badge variant="destructive" className="bg-red-500 text-white font-semibold animate-pulse shadow-lg">
                        {unreadChat > 99 ? '99+' : unreadChat}
                      </Badge>
                    )}
                    {isOps && unreadAssignments > 0 && !collapsed && (
                      <Badge className="bg-orange-500 text-white font-semibold animate-pulse shadow-lg">
                        {unreadAssignments > 9 ? '9+' : unreadAssignments}
                      </Badge>
                    )}
                  </span>
                </span>
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="mt-auto border-t border-border/50 bg-background/50 p-4 backdrop-blur-sm">
          <div className="mb-3">
            <ChangePasswordDialog />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Version 1.0.1</span>
            <span>&copy; {new Date().getFullYear()} TCNP</span>
          </div>
        </div>
      )}
    </div>
  )
}
