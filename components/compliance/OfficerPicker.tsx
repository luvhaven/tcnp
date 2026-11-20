"use client"

import { useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

export type PickerOfficer = { id: string; full_name: string | null; oscar?: string | null }

/**
 * A phone-friendly single-choice officer list: a search box over a scrolling
 * list of 44px rows (a radiogroup), with officers active on the chosen
 * programme marked and listed first by the caller.
 */
export function OfficerPicker({
  id,
  officers,
  value,
  onChange,
  onProgramme,
  disabled = false,
  label = "Officer",
}: {
  id: string
  officers: readonly PickerOfficer[]
  value: string
  onChange: (officerId: string) => void
  onProgramme?: ReadonlySet<string>
  disabled?: boolean
  label?: string
}) {
  const [search, setSearch] = useState("")
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return officers
    return officers.filter((officer) =>
      `${officer.full_name ?? ""} ${officer.oscar ?? ""}`.toLowerCase().includes(needle),
    )
  }, [officers, search])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={`${id}-search`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search officers"
          aria-label={`Search ${label.toLowerCase()}s`}
          className="pl-9"
          disabled={disabled}
        />
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="max-h-56 overflow-y-auto rounded-lg border border-border/70"
      >
        {visible.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No officer matches “{search.trim()}”.</p>
        ) : (
          visible.map((officer) => {
            const selected = officer.id === value
            return (
              <button
                key={officer.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(officer.id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left text-sm last:border-b-0",
                  selected ? "bg-primary/10" : "hover:bg-muted/60",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                  aria-hidden="true"
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{officer.full_name || "Unnamed officer"}</span>
                  {officer.oscar && <span className="block truncate text-xs text-muted-foreground">{officer.oscar}</span>}
                </span>
                {onProgramme?.has(officer.id) && (
                  <Badge variant="outline" className="shrink-0 border-emerald-500/30 text-[10px] text-emerald-700 dark:text-emerald-300">
                    On programme
                  </Badge>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
