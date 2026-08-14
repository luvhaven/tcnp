"use client"

import Link from "next/link"
import {
  LogOut,
  Sun,
  Moon,
  Palette,
  UserCircle,
  Settings,
  KeyRound,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
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
]

function ThemeSegmented() {
  const { theme, setTheme } = useTheme()
  const currentTheme = theme === "dark" ? "dark" : "light"

  return (
    <div className="flex items-center justify-between px-1 py-1.5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>Theme</span>
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-muted/80 p-0.5 border border-border/50">
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => {
          const isSelected = currentTheme === value
          return (
            <button
              key={value}
              type="button"
              aria-label={`${label} mode`}
              title={`${label} mode`}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150",
                isSelected
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        })}
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
  const sizeClass = size === "lg" ? "h-11 w-11" : "h-9 w-9"

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
    <Avatar className={cn(sizeClass, "shadow-xs border border-border/60")}>
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt="" className="object-cover" />
      ) : (
        <AvatarFallback className="bg-primary-text text-xs font-bold text-white">
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
  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : displayName

  const handleLogout = async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <header className="app-header sticky top-0 z-40 flex h-16 min-w-0 items-center justify-between gap-2 border-b bg-background/80 px-4 shadow-xs backdrop-blur-md transition-all duration-200 nav:px-8">
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

      {/* Right: Install → Notifications → Profile Pill Trigger */}
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2.5">
        <InstallButton />
        <NotificationCenter />

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={userLoading ? "Loading profile" : "Open user menu"}
              aria-busy={userLoading}
              aria-expanded={menuOpen}
              disabled={userLoading}
              className={cn(
                "group flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card/70 p-1 pl-1 pr-2.5 transition-all duration-200 shadow-2xs",
                "hover:border-primary/40 hover:bg-muted/80 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                menuOpen && "border-primary/50 bg-muted/90 ring-2 ring-primary/20 shadow-xs"
              )}
            >
              <div className="relative">
                <ProfileAvatar
                  loading={userLoading}
                  photoUrl={profile?.photo_url}
                  fullName={profile?.full_name}
                  email={user?.email}
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>

              <div className="hidden flex-col text-left nav:flex">
                <span className="max-w-[95px] truncate text-xs font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
                  {firstName}
                </span>
                <span className="max-w-[95px] truncate text-[10px] text-muted-foreground leading-tight">
                  {profile?.oscar || (profile?.role ? formatRole(profile.role) : "Officer")}
                </span>
              </div>

              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                  menuOpen && "rotate-180 text-primary"
                )}
                aria-hidden="true"
              />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-[270px] rounded-2xl border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md"
          >
            {/* Header User Card (Clickable to My Profile) */}
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="group -m-1 mb-2 flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
            >
              <ProfileAvatar
                loading={userLoading}
                photoUrl={profile?.photo_url}
                fullName={profile?.full_name}
                email={user?.email}
                size="md"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-sm font-bold leading-tight group-hover:text-primary transition-colors">{displayName}</p>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <p className="truncate text-xs text-muted-foreground mt-0.5">{user?.email}</p>
                {profile?.role && (
                  <span className="mt-1 inline-flex w-fit items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                    {formatRole(profile.role)}
                  </span>
                )}
              </div>
            </Link>

            <hr className="my-1.5 border-border/60" />

            {/* Navigation links */}
            <div className="space-y-0.5 py-1">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <UserCircle className="h-4 w-4 text-primary" />
                <span>My Profile</span>
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
              <Link
                href="/change-password"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <KeyRound className="h-4 w-4" />
                <span>Change Password</span>
              </Link>
            </div>

            <hr className="my-1.5 border-border/60" />

            {/* Theme switcher: Light & Dark only */}
            <ThemeSegmented />

            <hr className="my-1.5 border-border/60" />

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Log out
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
