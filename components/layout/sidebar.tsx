"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  { name: "Programs", href: "/programs", icon: Calendar },
  { name: "Journeys", href: "/journeys", icon: MapPin },
  { name: "Papas (Guests)", href: "/papas", icon: Users },
  { name: "Fleet (Cheetahs)", href: "/cheetahs", icon: Car },
  { name: "Cheetah Tracking", href: "/tracking/cheetahs", icon: Navigation },
  { name: "Eagle Tracking", href: "/tracking/eagles", icon: Plane },
  { name: "Live Tracking", href: "/tracking/live", icon: MapPin },
  { name: "Team Chat", href: "/chat", icon: MessageCircle },
  { name: "Protocol Officers", href: "/officers", icon: UserCircle },
  { name: "Manage Officers", href: "/officers/manage", icon: Settings },
  { name: "Eagle Squares", href: "/eagle-squares", icon: Plane },
  { name: "Nests (Hotels)", href: "/nests", icon: Hotel },
  { name: "Theatres (Venues)", href: "/theatres", icon: MapPin },
  { name: "Incidents", href: "/incidents", icon: AlertTriangle },
  { name: "Audit Logs", href: "/audit-logs", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div 
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4 justify-between">
        <Link href="/dashboard" className="flex items-center space-x-2 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
            <span className="text-lg font-bold">T</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col animate-fade-in">
              <span className="text-sm font-semibold">TCNP</span>
              <span className="text-xs text-muted-foreground">Journey Mgmt</span>
            </div>
          )}
        </Link>
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
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                collapsed ? "justify-center" : "space-x-3",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", collapsed && "mx-auto")} />
              {!collapsed && <span className="animate-fade-in">{item.name}</span>}
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
