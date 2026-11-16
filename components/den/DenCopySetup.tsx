"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { DEN_PLAN_KEY } from "@/lib/den-plan"
import { DEN_MY_WORK_KEY, DEN_ROSTER_KEY, DEN_WORK_KEY } from "@/lib/den-work"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

type Source = { program_id: string; program_name: string; start_date: string | null; tasks: number; checklists: number; shifts: number }

type Props = { targetProgram: string; targetName: string | null }

/**
 * Start a programme from the last one instead of a blank page: its tasks,
 * checklists, shifts and service notes come across, moved to the new dates,
 * with nobody assigned — the team is chosen fresh each time.
 */
export default function DenCopySetup({ targetProgram, targetName }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState("")
  const [parts, setParts] = useState({ tasks: true, checklists: true, shifts: true })

  const sources = useQuery({
    queryKey: ["den", "copy-sources"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.rpc("den_programmes_with_setup")
      if (error) throw error
      return ((data ?? []) as Source[]).filter(row => row.program_id !== targetProgram)
    },
  })
  const chosen = (sources.data ?? []).find(row => row.program_id === source) ?? null

  const copy = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("den_copy_programme_setup", {
        source_program: source, target_program: targetProgram,
        copy_tasks: parts.tasks, copy_checklists: parts.checklists, copy_shifts: parts.shifts,
      })
      if (error) throw error
      return data as { tasks: number; checklists: number; shifts: number; dates_moved: boolean }
    },
    onSuccess: (result) => {
      for (const key of [DEN_PLAN_KEY, DEN_WORK_KEY, DEN_ROSTER_KEY, DEN_MY_WORK_KEY]) queryClient.invalidateQueries({ queryKey: key })
      setOpen(false)
      const pieces = [
        result.tasks && `${result.tasks} ${result.tasks === 1 ? "task" : "tasks"}`,
        result.checklists && `${result.checklists} ${result.checklists === 1 ? "checklist" : "checklists"}`,
        result.shifts && `${result.shifts} ${result.shifts === 1 ? "shift" : "shifts"}`,
      ].filter(Boolean)
      toast.success(pieces.length ? `Copied ${pieces.join(", ")}` : "Plan notes copied")
      if (!result.dates_moved) toast.info("One of the programmes has no start date, so deadlines were left blank and shifts were not copied.")
    },
    onError: (error) => notifyError(error, "Could not copy the set-up"),
  })

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setSource(""); setOpen(true) }}>
        <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Copy from a previous programme
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy a previous set-up</DialogTitle>
            <DialogDescription>
              Into {targetName ?? "this programme"}. Dates move with the programme, tasks arrive unassigned and shifts arrive empty.
              Anything already here stays.
            </DialogDescription>
          </DialogHeader>
          {sources.isLoading ? <Skeleton className="h-24 rounded-xl" /> : (sources.data ?? []).length === 0 ? (
            <EmptyState icon={Copy} title="Nothing to copy yet" description="Once a programme has tasks, checklists or shifts, it can be copied into the next one." className="py-6" />
          ) : (
            <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (source && !copy.isPending) copy.mutate() }}>
              <div className="space-y-2">
                <Label htmlFor="den-copy-source">Copy from</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger id="den-copy-source"><SelectValue placeholder="Choose a programme" /></SelectTrigger>
                  <SelectContent>
                    {(sources.data ?? []).map(row => (
                      <SelectItem key={row.program_id} value={row.program_id}>
                        {row.program_name}{row.start_date ? ` (${format(new Date(`${row.start_date}T00:00:00`), "MMM yyyy")})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {chosen && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">What to bring across</legend>
                  {([["tasks", chosen.tasks, "task"], ["checklists", chosen.checklists, "checklist"], ["shifts", chosen.shifts, "shift"]] as const).map(([key, count, noun]) => (
                    <label key={key} className="flex min-h-10 items-center gap-3 rounded-lg border px-3 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        checked={parts[key] && count > 0}
                        disabled={count === 0}
                        onChange={(event) => setParts({ ...parts, [key]: event.target.checked })}
                      />
                      <span className="capitalize">{key}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{count} {count === 1 ? noun : `${noun}s`}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" pending={copy.isPending} disabled={!source}>Copy set-up</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
