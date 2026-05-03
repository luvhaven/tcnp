"use client"

import { Bell, LogOut, Menu, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import InstallButton from "@/components/pwa/InstallButton"
import NotificationCenter from "@/components/notifications/NotificationCenter"

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
            .select('*')
            .eq('id', user.id)
            .single()

          if (error) {
            console.warn('Error loading user profile (non-fatal):', error)
          }

          setProfile(profile)
        }
      } catch (error) {
        // iOS Safari can throw during hydration - suppress to prevent crash
        console.warn('User fetch failed (non-fatal):', error)
      }
    }

    getUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase()
  }

  const formatRole = (role: string) => {
    return role
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur-md px-6 shadow-sm transition-all duration-200">
      <div className="flex items-center space-x-3">
        <button
          type="button"
          aria-label="Open navigation sidebar"
          onClick={onOpenSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-foreground shadow-sm md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold tracking-tight md:text-xl truncate max-w-[140px] sm:max-w-xs md:max-w-none">
            Welcome, {profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}
          </h1>
          {profile?.role && (
            <span className="mt-0.5 inline-flex max-w-full items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary md:mt-1 md:px-3 md:py-1 md:text-[11px]">
              {formatRole(profile.role)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-1 md:space-x-3">
        {/* Install Button — desktop only */}
        <InstallButton />

        {/* Notifications */}
        <NotificationCenter />

        {/* Avatar — always visible */}
        <Avatar className="h-8 w-8 md:h-9 md:w-9">
          <AvatarImage src={profile?.avatar_url} />
          <AvatarFallback className="text-xs">
            {user?.email ? getInitials(user.email) : 'U'}
          </AvatarFallback>
        </Avatar>

        {/* Email + role — desktop only */}
        <div className="hidden md:block">
          <p className="text-sm font-medium truncate max-w-[160px]">{user?.email}</p>
          {profile?.role && (
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {formatRole(profile.role)}
            </p>
          )}
        </div>

        {/* Logout — icon only on mobile, icon+accessible on desktop */}
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out" className="h-8 w-8 md:h-9 md:w-9">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}
