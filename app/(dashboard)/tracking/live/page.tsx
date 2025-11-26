'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import LiveTrackingMap from '@/components/tracking/LiveTrackingMap'

type CurrentUser = {
  id: string
  role: string | null
}

const ALLOWED_ROLES = ['super_admin', 'admin']

export default function LiveTrackingPage() {
  const supabase = createClient()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          toast.error('Please login to access live tracking.')
          return
        }

        const { data: userData, error } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Failed to load current user for live tracking:', error)
          toast.error('Failed to verify your access to live tracking.')
          return
        }

        setCurrentUser(userData as CurrentUser)

        if (!userData || !ALLOWED_ROLES.includes((userData as any).role)) {
          toast.error('Access denied. Live tracking is restricted to admin roles.')
        }
      } catch (err) {
        console.error('Unexpected error loading user for live tracking:', err)
        toast.error('Failed to verify your access to live tracking.')
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role ?? '')) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Live tracking is available only to Super Admin and Admin roles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return <LiveTrackingMap />
}
