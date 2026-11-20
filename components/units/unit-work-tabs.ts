"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"

/**
 * The "Tasks" (?tab=tasks) and "Programme team" (?tab=team) tabs every unit
 * page carries. Shown to the unit's members and to Command (is_admin(), which
 * includes platform admins): the same readers UnitTasks and UnitProgrammeTeam
 * fetch for. Who may add, assign or grant is decided inside those components.
 */
export const UNIT_WORK_TABS = ["tasks", "team"] as const

export type UnitWorkTabValue = (typeof UNIT_WORK_TABS)[number]

export function canSeeUnitWork(access: { isMember: boolean; isCommand: boolean }): boolean {
  return access.isMember || access.isCommand
}

/** True when ?tab= names one of the unit work tabs and this officer can open it. */
export function isUnitWorkTab(value: string | null | undefined, canSee: boolean): value is UnitWorkTabValue {
  return canSee && (value === "tasks" || value === "team")
}

/** The tab to show: the requested one when it is offered, otherwise the first (default) tab. */
export function resolveAddressTab<T extends string>(requested: string | null | undefined, tabs: readonly T[]): T {
  return tabs.includes(requested as T) ? (requested as T) : tabs[0]
}

/**
 * A page's tab kept in ?tab= (the first tab is the default and is not written).
 * The address bar leads: a notification tap or Back that changes ?tab= while
 * the page stays mounted moves the tab with it. A requested tab that is not
 * offered yet (access still loading) shows the default and is kept, so it
 * opens once the access arrives. Callers sit under a Suspense boundary
 * because useSearchParams needs one to prerender.
 */
export function useAddressTab<T extends string>(tabs: readonly T[]): [T, (next: string) => void] {
  const addressTab = useSearchParams().get("tab")
  const [requested, setRequested] = useState<string | null>(addressTab)
  const [seen, setSeen] = useState<string | null>(addressTab)
  if (seen !== addressTab) {
    setSeen(addressTab)
    setRequested(addressTab)
  }
  const tab = resolveAddressTab(requested, tabs)
  const select = (next: string) => {
    setRequested(next)
    try {
      const url = new URL(window.location.href)
      if (next === tabs[0]) url.searchParams.delete("tab")
      else url.searchParams.set("tab", next)
      window.history.replaceState(window.history.state, "", url)
    } catch {
      // The tab still changes; only the shareable address is skipped.
    }
  }
  return [tab, select]
}
