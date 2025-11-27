"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount'
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
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "My Assignments", href: "/my-assignments", icon: Navigation },
  { name: "Programs", href: "/programs", icon: Calendar },
  { name: "Journeys", href: "/journeys", icon: MapPin },
  { name: "Papas", href: "/papas", icon: Users },
  { name: "Cheetahs", href: "/cheetahs", icon: Car },
  { name: "Eagle Operations", href: "/eagles", icon: Plane },
  { name: "Live Tracking", href: "/tracking/live", icon: MapPin },
  { name: "Team Chat", href: "/chat", icon: MessageCircle },
  { name: "Officers", href: "/officers", icon: UserCircle },
  { name: "Nests", href: "/nests", icon: Hotel },
  { name: "Theatres", href: "/theatres", icon: MapPin },
  { name: "Incidents", href: "/incidents", icon: AlertTriangle },
  { name: "Audit Logs", href: "/audit-logs", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
]

type SidebarProps = {
  isMobile?: boolean
  onClose?: () => void
}

export function Sidebar({ isMobile = false, onClose }: SidebarProps) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { count: unreadCount } = useUnreadChatCount()
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userOscar, setUserOscar] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (!user) {
        setCurrentUser(null)
        setUserRole(null)
        setUserOscar(null)
        return
      }

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
    }

    void loadUser()
  }, [supabase])

  useEffect(() => {
    if (!currentUser) return

    const channel = supabase.channel('chat-notifications')

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        // Hook will handle updates via chat_messages subscription.
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, currentUser])

  const isDeltaOscar = (userRole === 'delta_oscar') || (userOscar === 'delta_oscar')

  const visibleNavigation = useMemo(
    () =>
      isDeltaOscar
        ? navigation.filter((item) =>
          item.href === '/my-assignments' || item.href === '/chat'
        )
        : navigation,
    [isDeltaOscar]
  )

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border/60 bg-gradient-to-b from-background via-card/95 to-background/95 shadow-lg transition-all duration-300 ease-in-out",
        isMobile ? "w-64" : collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4 justify-between">
        <Link
          href="/dashboard"
          className="flex items-center space-x-2 overflow-hidden"
          onClick={isMobile ? onClose : undefined}
        >
          <div className="relative h-8 w-8 flex-shrink-0">
            <Image src="/tcnp_logo.png" alt="The Covenant Nation" fill className="object-contain" priority />
          </div>
          {!collapsed && (
            <div className="flex flex-col animate-fade-in">
              <span className="text-sm font-semibold">The Covenant Nation</span>
              <span className="text-xs text-muted-foreground">Journey Management</span>
            </div>
          )}
        </Link>
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 flex-shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {visibleNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 border border-transparent",
                collapsed ? "justify-center" : "space-x-3",
                isActive
                  ? "bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 text-primary border-primary/50 shadow-md"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground hover:border-primary/30"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
              {!collapsed && (
                <span className="flex items-center justify-between w-full animate-fade-in">
                  <span>{item.name}</span>
                  {item.name === "Team Chat" && unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-auto bg-red-500 text-white font-semibold animate-pulse shadow-lg"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t p-4 animate-fade-in">
          <div className="text-xs text-muted-foreground">
            <p>Version 1.0.0</p>
            <p className="mt-1">© 2025 TCNP</p>
          </div>
        </div>
      )}
    </div>
  )
}
