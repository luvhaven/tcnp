"use client"

import { createContext, useContext } from "react"
import type { LucideIcon } from "lucide-react"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ProgrammeChoice = { id: string; name: string; status: string }

type DenProgrammeContextValue = {
  programs: ProgrammeChoice[]
  /** False until the programme list has arrived. */
  loaded: boolean
  select: (programId: string) => void
}

const DenProgrammeContext = createContext<DenProgrammeContextValue>({ programs: [], loaded: true, select: () => {} })

/** Lets any Den tab offer the programme choice in place, without prop drilling. */
export const DenProgrammeProvider = DenProgrammeContext.Provider

const OPEN_STATUSES = new Set(["planning", "active"])

/**
 * Shown by a tab that works one programme at a time when none is chosen. The
 * programmes are offered right here as buttons, so nobody has to go looking
 * for the filter at the top of the page.
 */
export default function ChooseProgramme({ icon, description, className }: { icon: LucideIcon; description: string; className?: string }) {
  const { programs, loaded, select } = useContext(DenProgrammeContext)
  // Not knowing yet is different from there being none: never say "no
  // programmes" (or ask for a choice the page is about to make) while loading.
  if (!loaded) return <Skeleton className={cn("mx-auto my-8 h-40 w-full max-w-xl rounded-2xl", className)} />
  // Programmes being planned or running come first: they are what is being worked on.
  const ordered = [...programs].sort((a, b) =>
    Number(OPEN_STATUSES.has(b.status)) - Number(OPEN_STATUSES.has(a.status)) || a.name.localeCompare(b.name))

  return (
    <EmptyState
      icon={icon}
      title={ordered.length ? "Choose a programme" : "No programmes yet"}
      description={ordered.length ? description : "Leadership creates programmes. Once one exists, the Den can plan for it here."}
      className={className}
      action={ordered.length ? (
        <div className="flex max-w-xl flex-wrap justify-center gap-2">
          {ordered.slice(0, 8).map(program => (
            <Button key={program.id} variant="outline" size="sm" className="max-w-full" onClick={() => select(program.id)}>
              <Calendar className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{program.name}</span>
            </Button>
          ))}
        </div>
      ) : undefined}
    />
  )
}
