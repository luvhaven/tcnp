'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LiveTrackingMap from '@/components/tracking/LiveTrackingMap'

import { canViewLiveTracking } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function LiveTrackingPage() {
  const { data: currentUser, isLoading: loading } = useCurrentUser()
  const hasAccess = Boolean(currentUser && canViewLiveTracking(currentUser.role, currentUser.oscar))

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-40 rounded-md bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
        <div className="h-[600px] rounded-xl border bg-muted animate-pulse" />
      </div>
    )
  }

  // No access — show access denied instead of blank
  if (!hasAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-alert"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
        </div>
        <h2 className="text-xl font-bold tracking-tight">Access Restricted</h2>
        <p className="mt-2 max-w-md text-muted-foreground">
          Live Tracking is restricted to Admin, Command, Captain, Vice Captain, and Operations Leadership. Your current role (<span className="font-semibold text-foreground">{currentUser?.role || 'Unassigned'}</span>) does not have clearance.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-3 -mb-4 sm:-mx-4 sm:-mb-6 overflow-hidden bg-background">
      <LiveTrackingMap />
    </div>
  )
}
