"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import type { PickerOfficer } from "@/components/compliance/OfficerPicker"

const supabase = createClient()
const NO_IDS: ReadonlySet<string> = new Set()

export const complianceKeys = {
  inspections: ["compliance-inspections"] as const,
  myInspections: (userId: string | null | undefined) => ["compliance-inspections", "mine", userId ?? null] as const,
  recognitions: ["compliance-recognitions"] as const,
  awards: ["compliance-awards"] as const,
}

/** Active officers for the inspection / recognition pickers (managers only). */
export function useActiveOfficers(enabled: boolean) {
  return useQuery({
    queryKey: ["active-officers-lite", "compliance"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, oscar")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
      if (error) throw error
      return (data ?? []) as PickerOfficer[]
    },
  })
}

/**
 * Officers active on a programme (an active title assignment for it), the
 * same test as is_program_active_officer(). Used to list them first; a failed
 * read only loses the ordering, never the picker.
 */
export function useProgrammeOfficerIds(programId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["programme-active-officers", programId ?? null],
    enabled: Boolean(programId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("title_assignments")
        .select("user_id")
        .eq("program_id", programId)
        .eq("is_active", true)
      if (error) throw error
      return new Set<string>(((data ?? []) as { user_id: string | null }[]).map((row) => row.user_id).filter((id): id is string => Boolean(id)))
    },
  })
  return { ids: query.data ?? NO_IDS, isLoading: query.isLoading && Boolean(programId) }
}
