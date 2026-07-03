"use client"

import { Bell, LogOut, Menu, User, MoreVertical, KeyRound, MonitorSmartphone } from "lucide-react"
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
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import InstallButton from "@/components/pwa/InstallButton"
import NotificationCenter from "@/components/notifications/NotificationCenter"
import Link from "next/link"

export function Header({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        if (user) {
          const { data: profile, error } = await supabase
            .from('users')
            .select('id, full_name, role, photo_url, oscar')
            .eq('id', user.id)
            .single()

          if (error) {
            console.warn('Error loading user profile (non-fatal):', error)
          }

          setProfile(profile)
        }
      } catch (error) {
        console.warn('User fetch failed (non-fatal):', error)
      }
    }

    getUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.trim().split(' ')
      return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].substring(0, 2).toUpperCase()
    }
    return (email || '??').substring(0, 2).toUpperCase()
  }

  const formatRole = (role: string) => {
    return role
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur-md px-4 md:px-6 shadow-sm transition-all duration-200">
      {/* Left: hamburger + greeting */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          aria-label="Open navigation sidebar"
          onClick={onOpenSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-foreground shadow-sm md:hidden flex-shrink-0"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold tracking-tight md:text-lg truncate max-w-[130px] sm:max-w-xs md:max-w-none">
            Welcome, {profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}
          </h1>
          {profile?.role && (
            <span className="inline-flex max-w-full items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary md:px-3 md:py-1 md:text-[11px]">
              {formatRole(profile.role)}
            </span>
          )}
        </div>
      </div>

      {/* Right: action cluster */}
      <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
        {/* Install Button — desktop only */}
        <div className="hidden md:block">
          <InstallButton />
        </div>

        {/* Notifications — always visible */}
        <NotificationCenter />

        {/* Avatar + email — desktop only */}
        <div className="hidden md:flex items-center gap-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.photo_url} />
            <AvatarFallback className="text-xs font-semibold">
              {getInitials(profile?.full_name, user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-none">
            <p className="text-sm font-medium truncate max-w-[150px]">{user?.email}</p>
            {profile?.role && (
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                {formatRole(profile.role)}
              </p>
            )}
          </div>
        </div>

        {/* Desktop: standalone logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Sign out"
          className="hidden md:inline-flex h-9 w-9 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>

        {/* Mobile: avatar + "more" dropdown collapsing secondary actions */}
        <div className="flex items-center gap-1 md:hidden">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.photo_url} />
            <AvatarFallback className="text-xs font-semibold">
              {getInitials(profile?.full_name, user?.email)}
            </AvatarFallback>
          </Avatar>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Identity block */}
              <div className="px-3 py-2 border-b">
                <p className="text-sm font-medium truncate">{profile?.full_name || user?.email}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuItem asChild>
                <Link href="/change-password" className="flex items-center gap-2 cursor-pointer">
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <div className="flex items-center gap-2">
                  <MonitorSmartphone className="h-4 w-4" />
                  <InstallButton />
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
