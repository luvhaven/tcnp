'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { setLocationSharingUser, refreshLocationSharing } from '@/lib/location-toggle'

export function LocationSharingSync() {
  const { data: user } = useCurrentUser()
  useEffect(() => {
    if (!user?.id) return
    setLocationSharingUser(user.id)
    const sync = () => { void refreshLocationSharing() }
    sync()
    const db = createClient()
    const channel = db.channel(`location-sharing-${user.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, sync).subscribe()
    const interval = window.setInterval(sync, 15000)
    window.addEventListener('online', sync)
    window.addEventListener('focus', sync)
    const visible = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(interval); window.removeEventListener('online', sync); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', visible); void db.removeChannel(channel) }
  }, [user?.id])
  return null
}
