"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ListPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DEN_INVENTORY_KEY, parseStockLines } from "@/lib/den-inventory"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

/**
 * Load the Den's stock list in one go: one item per line, with its unit,
 * what is on the shelf now and when to warn. Each opening count is recorded
 * as a "received" movement, so the ledger is complete from the first line.
 */
export default function DenBulkStock({ currentUserId, existingNames }: { currentUserId: string | null; existingNames: string[] }) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const parsed = parseStockLines(text, existingNames)

  const save = useMutation({
    mutationFn: async () => {
      let added = 0
      for (const row of parsed.rows) {
        const { data: created, error } = await db.from("den_inventory_items")
          .insert([{ name: row.name, unit: row.unit, reorder_level: row.reorderLevel, category: row.category, created_by: currentUserId }])
          .select("id").single()
        if (error) throw new Error(`${row.name}: ${error.code === "23505" ? "already on the list" : error.message}`)
        if (row.quantity > 0) {
          const { error: stockError } = await db.rpc("den_record_stock", { target_item: created.id, movement: "receive", amount: row.quantity, movement_note: "Opening stock" })
          if (stockError) throw new Error(`${row.name}: ${stockError.message}`)
        }
        added += 1
      }
      return added
    },
    onSuccess: (added) => { queryClient.invalidateQueries({ queryKey: DEN_INVENTORY_KEY }); setOpen(false); setText(""); toast.success(`${added} ${added === 1 ? "item" : "items"} added`) },
    // Lines before the failing one were saved; refresh so the list shows them.
    onError: (error) => { queryClient.invalidateQueries({ queryKey: DEN_INVENTORY_KEY }); notifyError(error, "Some items could not be added") },
  })

  return (
    <>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
        <ListPlus aria-hidden="true" />
        Add several
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add several stock items</DialogTitle>
            <DialogDescription>One item per line: name, unit, how many you have now, and when to warn you. Only the name is required. Write numbers without commas, or paste straight from a spreadsheet.</DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-3" onSubmit={(event) => { event.preventDefault(); if (parsed.rows.length && !save.isPending) save.mutate() }}>
            <div className="space-y-2">
              <Label htmlFor="den-bulk-stock">Items</Label>
              <Textarea
                id="den-bulk-stock"
                rows={8}
                className="font-mono text-sm"
                placeholder={"Bottled water 50cl, pcs, 120, 24\nFace towels, pcs, 40, 10\nGlass cups, pcs, 60"}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {parsed.rows.length ? `${parsed.rows.length} ${parsed.rows.length === 1 ? "item" : "items"} ready to add.` : "Nothing to add yet."}
            </p>
            {parsed.problems.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                {parsed.problems.map(problem => <li key={problem}>{problem}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" pending={save.isPending} disabled={parsed.rows.length === 0}>Add {parsed.rows.length || ""} items</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
