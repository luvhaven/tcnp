'use client'

import { useEffect, useEffectEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Query families that read a deleted table or data joined to it.
const queryFamiliesByTable: Record<string, readonly string[]> = {
  programs: [
    'programs', 'programs-lite', 'chat-rooms', 'chat-room-members', 'victor', 'papas', 'cheetahs',
    'nests', 'noscar_assignments', 'papa-accommodations', 'program-menus',
    'papa-meal-orders', 'papa-meal-order-menus', 'papa-meal-order-papas',
    'serial-media', 'finance-documents', 'compliance-posts', 'seat-arrangements',
    'seat-assignments', 'welfare-prayer-campaigns', 'nest-papa-arrivals', 'officers',
  ],
  theatres: ['theatres', 'theatres-lite', 'programs', 'seat-arrangements', 'victor'],
  papas: [
    'papas', 'papas-lite', 'papas-lite-seating', 'papa-briefings', 'papa-accommodations',
    'papa-meal-order-papas', 'papa-meal-orders', 'chat-rooms', 'nest-papa-arrivals',
    'seat-assignments', 'tango-papa-itineraries', 'chat-room-members',
  ],
  cheetahs: ['cheetahs', 'journey-cheetahs', 'tango-journeys-board'],
  nests: ['nests', 'nests-lite', 'myNestId', 'noscar_assignments', 'papa-accommodations', 'nest-rooms', 'nest-room-stays'],
  noscar_assignments: ['noscar_assignments', 'myNestId'],
  users: [
    'officers', 'officer-details', 'chat-rooms', 'chat-room-members', 'welfare-officer-directory',
    'welfare-birthdays-today', 'training-officers', 'active-officers-lite', 'tango-people-lite',
  ],
  journeys: ['tango-journeys-board', 'journey-cheetahs', 'tango-duty-officers'],
  papa_accommodations: ['papa-accommodations', 'nest-papa-arrivals'],
  hospitality_places: ['hospitality-places'],
  nest_room_stays: ['nest-room-stays', 'nest-room-guests'],
  fleet_partners: ['fleet-partners', 'journey-cheetahs'],
  journey_cheetahs: ['journey-cheetahs', 'tango-journeys-board'],
  vendors: ['vendors', 'program-menus', 'papa-meal-order-menus'],
  program_menus: ['program-menus', 'papa-meal-order-menus', 'papa-meal-orders'],
  seat_assignments: ['seat-assignments'],
  seat_arrangements: ['seat-arrangements'],
  theatre_vips: ['victor'],
  training_schedules: ['training-schedules', 'training-schedules-lite', 'training-attendance', 'training-evaluations'],
  oscar_documents: ['oscar-documents'],
  unit_memberships: ['unit-members', 'unit-membership', 'unit-access', 'can-manage-unit'],
  media_assets: ['serial-media'],
  finance_documents: ['finance-documents'],
  compliance_posts: ['compliance-posts'],
  prayer_campaigns: ['welfare-prayer-campaigns', 'welfare-prayer-slots', 'welfare-prayer-slot-members'],
  prayer_slot_members: ['welfare-prayer-slot-members'],
}

type DeletionListener = (tables: ReadonlySet<string> | null) => void
const listeners = new Set<DeletionListener>()
const topic = 'dashboard-deletions'
let channelCleanup: Promise<unknown> = Promise.resolve()

/** Refresh a dashboard view that manages its own data outside React Query. */
export function useReloadOnDeletion(tables: readonly string[], reload: () => void) {
  const onDeletion = useEffectEvent<DeletionListener>((changedTables) => {
    if (!changedTables || tables.some(table => changedTables.has(table))) reload()
  })

  useEffect(() => {
    const listener: DeletionListener = changedTables => onDeletion(changedTables)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
}

export function useDashboardDeletions(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let refreshAll = false
    const pendingTables = new Set<string>()
    let channel: ReturnType<typeof supabase.channel> | undefined

    const refresh = () => {
      timer = undefined
      const changedTables = refreshAll ? null : new Set(pendingTables)
      pendingTables.clear()
      refreshAll = false

      const tables = changedTables ?? Object.keys(queryFamiliesByTable)
      const families = new Set(Array.from(tables).flatMap(table =>
        Object.prototype.hasOwnProperty.call(queryFamiliesByTable, table) ? queryFamiliesByTable[table] : []
      ))
      const filters = { predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
        typeof queryKey[0] === 'string' && families.has(queryKey[0]) }

      // An initial request that started before the deletion could still return
      // an old list. Cancel it before asking for fresh data.
      void queryClient.cancelQueries(filters).then(() => {
        if (!stopped) return queryClient.invalidateQueries(filters)
      })
      listeners.forEach(listener => listener(changedTables))
    }

    const queueRefresh = (table?: string) => {
      if (stopped) return
      if (table) pendingTables.add(table)
      else refreshAll = true
      // Cascades can affect multiple tables in one transaction.
      timer ??= setTimeout(refresh, 75)
    }

    // The fixed broadcast topic must finish leaving before it is reused.
    const setup = channelCleanup.then(() => {
      if (stopped) return
      channel = supabase.channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'deleted' }, ({ payload }) => {
          if (typeof payload?.table === 'string') queueRefresh(payload.table)
        })
        .subscribe(status => {
          // Catch up on deletes during initial connection or reconnection.
          if (status === 'SUBSCRIBED') queueRefresh()
        })
    })

    return () => {
      stopped = true
      clearTimeout(timer)
      channelCleanup = setup.then(() => channel && supabase.removeChannel(channel)).catch(() => {})
    }
  }, [queryClient, userId])
}
