'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LiveTrackingMap from '@/components/tracking/LiveTrackingMap'

type CurrentUser = {
  id: string
  role: string | null
}

// Roles that can view live tracking
const ALLOWED_ROLES = [
  'super_admin',
  'dev_admin',
  'admin',
  'command',
  'captain',
  'vice_captain',
  'head_of_command',
  'head_of_operations',
  'tango_oscar',
  'head_tango_oscar',
  'alpha_oscar',
  'november_oscar',
]

export default function LiveTrackingPage() {
  const supabase = createClient()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: userData } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', user.id)
          .single()

        if (userData) {
          setCurrentUser(userData as CurrentUser)
        }
      } catch (err) {
        console.error('Unexpected error loading user for live tracking:', err)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [supabase])

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

  // No access — show nothing
  if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role ?? '')) {
    return null
  }

  return (
    <div className="h-[calc(100vh-4rem)] -mx-3 -mb-4 sm:-mx-4 sm:-mb-6 overflow-hidden rounded-none">
      <LiveTrackingMap />
    </div>
  )
}
