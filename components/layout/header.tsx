"use client"

import { LogOut, Menu, User, KeyRound, Sun, Moon, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useTheme, type AppTheme } from "@/components/theme/ThemeProvider"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useRouter } from "next/navigation"
import InstallButton from "@/components/pwa/InstallButton"
import NotificationCenter from "@/components/notifications/NotificationCenter"
import Link from "next/link"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="h-9 w-9"
    >
      {isDark
        ? <Sun className="h-4 w-4" aria-hidden="true" />
        : <Moon className="h-4 w-4" aria-hidden="true" />}
    </Button>
  )
}

export function Header({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const { data: currentUser } = useCurrentUser()
  const user = currentUser ? { email: currentUser.email } : null
  const profile = currentUser

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  /** Returns 1–2 uppercase initials. Prefers first + last name letters. */
  const getInitials = (fullName?: string | null, email?: string | null) => {
    if (fullName) {
      const parts = fullName.trim().split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      }
      return parts[0].substring(0, 2).toUpperCase()
    }
    return (email || '??').substring(0, 2).toUpperCase()
  }

  const formatRole = (role: string) =>
    role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const firstName = profile?.full_name?.split(/\s+/)[0] || user?.email?.split('@')[0] || 'User'
  const initials = getInitials(profile?.full_name, user?.email)

  // ── Shared profile dropdown content ──────────────────────────────────────
  const ProfileDropdownContent = () => (
    <DropdownMenuContent align="end" className="w-64 p-0 overflow-hidden">
      {/* Identity card */}
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b">
        <Avatar className="h-10 w-10 ring-2 ring-primary/20 flex-shrink-0">
          <AvatarImage src={profile?.photo_url ?? undefined} />
          <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">
            {profile?.full_name || user?.email}
          </p>
          <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
            {user?.email}
          </p>
          {profile?.role && (
            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {formatRole(profile.role)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="py-1">
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2 cursor-pointer px-4 py-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/change-password" className="flex items-center gap-2 cursor-pointer px-4 py-2 text-sm">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Change Password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </div>
    </DropdownMenuContent>
  )

  return (
    <header className="app-header sticky top-0 z-40 flex h-16 min-w-0 items-center justify-between gap-2 border-b bg-background/80 px-3 shadow-sm backdrop-blur-md transition-all duration-200 sm:px-4 md:px-6">
      {/* Left: hamburger + greeting */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open navigation sidebar"
          onClick={onOpenSidebar}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-sm lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-col">
          <h1 className="max-w-[130px] truncate text-sm font-semibold tracking-tight sm:max-w-xs md:text-lg lg:max-w-none">
            Welcome, {profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}
          </h1>
          {profile?.role && (
            <span className="inline-flex max-w-full items-center truncate rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary md:px-3 md:py-1 md:text-[11px]">
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold tracking-tight md:text-base truncate max-w-[130px] sm:max-w-xs md:max-w-none leading-tight">
            Welcome, {firstName}
          </h1>
          {profile?.role && (
            <span className="hidden sm:inline-flex w-fit max-w-full items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary md:px-3 md:py-1 md:text-[10px]">
              {formatRole(profile.role)}
            </span>
          )}
        </div>
      </div>

      {/* Right: action cluster */}
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/* Install — adaptive (label on desktop, icon on mobile), hides when installed */}
      <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
        <InstallButton />
        <ThemeToggle />
        <NotificationCenter />

        {/* ── Desktop: avatar dropdown ── */}
        <div className="hidden md:flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition-all duration-200 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Open profile menu"
              >
                <Avatar className="h-8 w-8 ring-2 ring-transparent transition-all duration-200 group-hover:ring-primary/40">
                  <AvatarImage src={profile?.photo_url ?? undefined} />
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <ProfileDropdownContent />
          </DropdownMenu>
        </div>

        {/* ── Mobile: avatar + dropdown ── */}
        <div className="flex items-center md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Open profile menu"
              >
                <Avatar className="h-8 w-8 ring-2 ring-transparent transition-all duration-200 hover:ring-primary/40">
                  <AvatarImage src={profile?.photo_url ?? undefined} />
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <ProfileDropdownContent />
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
