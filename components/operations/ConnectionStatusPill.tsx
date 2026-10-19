"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { syncService } from '@/lib/sync-service'
import { offlineQueue } from '@/lib/offline-queue'
import { cn } from '@/lib/utils'
import type { LiveState } from '@/hooks/useMyOperations'

const STATE_COPY: Record<LiveState, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  live: { label: 'Live', className: 'border-success/30 bg-success/10 text-success', Icon: Wifi },
  reconnecting: { label: 'Reconnecting', className: 'border-warning/30 bg-warning/10 text-warning', Icon: RefreshCw },
  offline: { label: 'Offline', className: 'border-destructive/30 bg-destructive/10 text-destructive', Icon: WifiOff },
}

/**
 * Tells a field officer whether what they see is current and whether anything
 * they sent is still waiting on the device. "N queued" links to the Outbox,
 * where queued submissions can be reviewed and retried.
 */
export default function ConnectionStatusPill({ state, className }: { state: LiveState; className?: string }) {
  const [queued, setQueued] = useState(0)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const count = await syncService.getPendingCount()
      if (active) setQueued(count)
    }
    void refresh()
    const offSync = syncService.onSync(() => { void refresh() })
    const offQueue = offlineQueue.onChange(() => { void refresh() })
    // Fallback poll: replay can also be triggered from other tabs/pages
    const interval = setInterval(() => { void refresh() }, 15_000)
    return () => {
      active = false
      offSync()
      offQueue()
      clearInterval(interval)
    }
  }, [])

  const { label, className: tone, Icon } = STATE_COPY[state]

  return (
    <div role="status" aria-live="polite" className={cn('flex items-center gap-1.5', className)}>
      <span className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium', tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      {queued > 0 && (
        <Link
          href="/outbox"
          className="inline-flex min-h-8 items-center rounded-full border border-warning/30 bg-warning/10 px-3 text-sm font-medium text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${queued} update${queued === 1 ? '' : 's'} queued on this device — open Outbox`}
        >
          {queued} queued
        </Link>
      )}
    </div>
  )
}
