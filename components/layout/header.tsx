"use client"

import { Bell, LogOut, Menu, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import InstallButton from "@/components/pwa/InstallButton"

export function Header({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
  .from('users')
  .select('*')
  .eq('id', user.id)
  .single()
        
        setProfile(profile)
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

  return (
    <header className="flex h-16 items-center justify-between border-b bg-gradient-to-r from-background/95 via-card/95 to-background/95 backdrop-blur-md px-4 md:px-6 shadow-sm">
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-foreground shadow-sm md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex flex-col">
          <h1 className="text-base font-semibold tracking-tight md:text-xl">
            Welcome back, {profile?.full_name || user?.email?.split('@')[0] || 'User'}
          </h1>
          {profile?.role && (
            <span className="mt-0.5 inline-flex max-w-full items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary md:mt-1 md:px-3 md:py-1 md:text-[11px]">
              {profile.role}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Install Button */}
        <InstallButton />

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
          </span>
        </Button>

        {/* User Menu */}
        <div className="flex items-center space-x-3">
          <Avatar>
            <AvatarImage src={profile?.avatar_url} />
            <AvatarFallback>
              {user?.email ? getInitials(user.email) : 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block">
            <p className="text-sm font-medium truncate">{user?.email}</p>
            {profile?.role && (
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                {profile.role}
              </p>
            )}
          </div>
        </div>

        {/* Logout */}
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
