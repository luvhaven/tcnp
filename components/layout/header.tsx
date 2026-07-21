"use client"

import { LogOut, Sun, Moon, Laptop, Palette } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { createClient } from "@/lib/supabase/client"
import { useTheme, type AppTheme } from "@/components/theme/ThemeProvider"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import InstallButton from "@/components/pwa/InstallButton"
import NotificationCenter from "@/components/notifications/NotificationCenter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <span className="relative flex h-5 w-5 flex-col items-center justify-center gap-[5px]" aria-hidden="true">
      {/* Top bar */}
      <span
        className={cn(
          "block h-[2.5px] w-5 bg-current transition-all duration-300 ease-in-out origin-center",
          isOpen ? "translate-y-[7.5px] rotate-45" : ""
        )}
      />
      {/* Middle bar */}
      <span
        className={cn(
          "block h-[2.5px] w-5 rounded-full bg-current transition-all duration-300 ease-in-out",
          isOpen ? "scale-x-0 opacity-0" : ""
        )}
      />
      {/* Bottom bar */}
      <span
        className={cn(
          "block h-[2.5px] w-5 rounded-full bg-current transition-all duration-300 ease-in-out origin-center",
          isOpen ? "-translate-y-[7.5px] -rotate-45" : ""
        )}
      />
    </span>
  )
}

const THEME_OPTIONS: { value: AppTheme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "auto", icon: Laptop, label: "System" },
]

function ThemeSegmented() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex items-center justify-between px-1 py-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Palette className="h-4 w-4" aria-hidden="true" />
        <span>Theme</span>
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-1">
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150",
              theme === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (email || "??").substring(0, 2).toUpperCase()
}

function formatRole(role: string) {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatHeaderDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatHeaderDateShort(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function ProfileAvatar({
  loading,
  photoUrl,
  fullName,
  email,
  size = "md",
}: {
  loading?: boolean
  photoUrl?: string | null
  fullName?: string | null
  email?: string | null
  size?: "md" | "lg"
}) {
  const sizeClass = size === "lg" ? "h-11 w-11" : "h-10 w-10"

  if (loading) {
    return (
      <span
        className={cn("inline-block shrink-0 animate-pulse rounded-full bg-muted", sizeClass)}
        aria-hidden
      />
    )
  }

  const initials = getInitials(fullName, email)

  return (
    <Avatar className={cn(sizeClass, "shadow-sm")}>
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt="" className="object-cover" />
      ) : (
        <AvatarFallback className="bg-[#ea580c] text-sm font-bold text-white">
          {initials}
        </AvatarFallback>
      )}
    </Avatar>
  )
}

export function Header({ onOpenSidebar, sidebarOpen = false }: { onOpenSidebar?: () => void; sidebarOpen?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const { data: currentUser, isPending: userLoading } = useCurrentUser()
  const user = currentUser ? { email: currentUser.email } : null
  const profile = currentUser
  const [menuOpen, setMenuOpen] = useState(false)
  const [headerDate, setHeaderDate] = useState("")
  const [headerDateShort, setHeaderDateShort] = useState("")

  useEffect(() => {
    const now = new Date()
    setHeaderDate(formatHeaderDate(now))
    setHeaderDateShort(formatHeaderDateShort(now))
  }, [])

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User"

  const handleLogout = async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <header className="app-header sticky top-0 z-40 flex h-16 min-w-0 items-center justify-between gap-2 border-b bg-background/80 px-4 shadow-sm backdrop-blur-md transition-all duration-200 nav:px-8">
      {/* Left: hamburger + date & role */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label={sidebarOpen ? "Close navigation sidebar" : "Open navigation sidebar"}
          onClick={onOpenSidebar}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-foreground nav:hidden"
        >
          <HamburgerIcon isOpen={sidebarOpen} />
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <p
            className="truncate text-sm font-semibold tracking-tight text-black dark:text-white sm:text-base md:text-lg"
            suppressHydrationWarning
          >
            <span className="sm:hidden">{headerDateShort || "\u00a0"}</span>
            <span className="hidden sm:inline">{headerDate || "\u00a0"}</span>
          </p>
          {profile?.role && (
            <span className="inline-flex w-fit max-w-[10.5rem] items-center truncate rounded-[8px] bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {formatRole(profile.role)}
            </span>
          )}
        </div>
      </div>

      {/* Right: Install → Notifications → Profile */}
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <InstallButton />
        <NotificationCenter />

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={userLoading ? "Loading profile" : "Open profile menu"}
              aria-busy={userLoading}
              aria-expanded={menuOpen}
              disabled={userLoading}
              className="inline-flex shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]/40 disabled:pointer-events-none disabled:hover:scale-100"
            >
              <ProfileAvatar
                loading={userLoading}
                photoUrl={profile?.photo_url}
                fullName={profile?.full_name}
                email={user?.email}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-[260px] rounded-[14px] border-0 bg-white p-3 text-foreground shadow-lg dark:bg-card"
          >
            <div className="flex min-w-0 flex-col px-1 py-1">
              <p className="truncate text-sm font-bold leading-tight">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>

            <hr className="my-2 border-border" />

            <ThemeSegmented />

            <hr className="my-2 border-border" />

            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
