"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, Boxes, MoreHorizontal, Minus, PackagePlus, Plus } from "lucide-react"
import { toast } from "sonner"
import DenBulkStock from "@/components/den/DenBulkStock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/ui/stat-card"
import { Textarea } from "@/components/ui/textarea"
import {
  DEN_INVENTORY_KEY,
  STOCK_MOVEMENT_LABEL,
  availableStock,
  compareInventoryItems,
  formatQuantity,
  parseAmount,
  previewMovement,
  stockLevel,
  type DenInventoryItem,
  type StockMovementType,
} from "@/lib/den-inventory"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Props = {
  selectedProgram: string // 'all' or a program id
  programName: string | null
  /** Head or platform admin: adds items, receives, counts and adjusts stock. */
  canManage: boolean
  /** Head, sub-lead or platform admin: reserves stock, records usage without a programme. */
  canCoordinate: boolean
  /** A Den member: may record usage for a programme they are on. */
  isMember: boolean
  currentUserId: string | null
}

type Reservation = { id: string; item_id: string; program_id: string; quantity: number }
type Movement = { id: string; movement_type: StockMovementType; change: number; balance_after: number; program_id: string | null; note: string | null; created_at: string; author: { full_name: string | null } | null; program: { name: string } | null }

const EMPTY_ITEM = { name: "", category: "", unit: "pcs", reorder_level: "", storage_location: "", notes: "" }
const MOVEMENT_COPY: Record<StockMovementType, { title: string; field: string; button: string }> = {
  use: { title: "Record usage", field: "How many were used?", button: "Record usage" },
  receive: { title: "Receive stock", field: "How many came in?", button: "Receive" },
  count: { title: "Stock count", field: "How many are on the shelf now?", button: "Save count" },
  adjust: { title: "Adjust stock", field: "Change (use a minus sign to remove)", button: "Adjust" },
}

/**
 * The Den's stock. Nobody types over a count: every change is recorded as a
 * movement — used, received, counted or adjusted — so the figure can always be
 * explained, and a count on the shelf doubles as the audit.
 */
export default function DenInventory({ selectedProgram, programName, canManage, canCoordinate, isMember, currentUserId }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const scoped = selectedProgram !== "all"
  const programId = scoped ? selectedProgram : null

  const [itemDialog, setItemDialog] = useState<{ editing: DenInventoryItem | null } | null>(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [move, setMove] = useState<{ item: DenInventoryItem; type: StockMovementType } | null>(null)
  const [moveForm, setMoveForm] = useState({ amount: "", note: "" })
  const [reserve, setReserve] = useState<{ item: DenInventoryItem; current: Reservation | null } | null>(null)
  const [reserveAmount, setReserveAmount] = useState("")
  const [historyOf, setHistoryOf] = useState<DenInventoryItem | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: DEN_INVENTORY_KEY })

  const items = useQuery({
    queryKey: [...DEN_INVENTORY_KEY, "items"],
    queryFn: async () => {
      const [itemRows, reservationRows] = await Promise.all([
        db.from("den_inventory_items").select("id, name, category, unit, quantity, reorder_level, storage_location, notes, is_active").eq("is_active", true),
        db.from("den_inventory_reservations").select("id, item_id, program_id, quantity"),
      ])
      if (itemRows.error) throw itemRows.error
      if (reservationRows.error) throw reservationRows.error
      return {
        items: ((itemRows.data ?? []) as DenInventoryItem[]).sort(compareInventoryItems),
        reservations: (reservationRows.data ?? []) as Reservation[],
      }
    },
  })

  const history = useQuery({
    queryKey: [...DEN_INVENTORY_KEY, "history", historyOf?.id],
    enabled: Boolean(historyOf),
    queryFn: async () => {
      const { data, error } = await db.from("den_inventory_movements")
        .select("id, movement_type, change, balance_after, program_id, note, created_at, author:users!den_inventory_movements_created_by_fkey(full_name), program:programs(name)")
        .eq("item_id", historyOf!.id).order("created_at", { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as Movement[]
    },
  })

  const saveItem = useMutation({
    mutationFn: async () => {
      const reorder = itemForm.reorder_level.trim() ? parseAmount(itemForm.reorder_level, { allowZero: true }) : 0
      if (reorder == null) throw new Error("The reorder level must be a number.")
      const values = {
        name: itemForm.name.trim(),
        category: itemForm.category.trim() || null,
        unit: itemForm.unit.trim() || "pcs",
        reorder_level: reorder,
        storage_location: itemForm.storage_location.trim() || null,
        notes: itemForm.notes.trim() || null,
      }
      if (itemDialog?.editing) {
        const { data, error } = await db.from("den_inventory_items").update(values).eq("id", itemDialog.editing.id).select("id")
        if (error) throw error
        if (!data?.length) throw new Error("You are not allowed to change this item.")
      } else {
        const { error } = await db.from("den_inventory_items").insert([{ ...values, created_by: currentUserId }])
        if (error) throw error
      }
    },
    onSuccess: () => { refresh(); setItemDialog(null); toast.success(itemDialog?.editing ? "Item updated" : "Item added. Receive stock to set its count.") },
    onError: (error: any) => {
      if (error?.code === "23505") toast.error("An item with that name already exists")
      else notifyError(error, "Could not save this item")
    },
  })

  const retireItem = useMutation({
    mutationFn: async (item: DenInventoryItem) => {
      const { data, error } = await db.from("den_inventory_items").update({ is_active: false }).eq("id", item.id).select("id")
      if (error) throw error
      if (!data?.length) throw new Error("You are not allowed to retire this item.")
    },
    onSuccess: () => { refresh(); setItemDialog(null); toast.success("Item retired. Its history is kept.") },
    onError: (error) => notifyError(error, "Could not retire this item"),
  })

  const record = useMutation({
    mutationFn: async () => {
      if (!move) throw new Error("Nothing to record.")
      const amount = parseAmount(moveForm.amount, { allowNegative: move.type === "adjust", allowZero: move.type === "count" })
      if (amount == null) throw new Error("Enter a number with at most two decimal places.")
      const preview = previewMovement(move.item, move.type, amount)
      if (!preview.ok) throw new Error(preview.reason)
      const { data, error } = await db.rpc("den_record_stock", {
        target_item: move.item.id,
        movement: move.type,
        amount,
        target_program: move.type === "use" ? programId : null,
        movement_note: moveForm.note.trim() || null,
      })
      if (error) throw error
      return { item: move.item, after: Number(data) }
    },
    onSuccess: ({ item, after }) => {
      refresh()
      setMove(null)
      toast.success(`${item.name}: ${formatQuantity(after)} ${item.unit} in stock`)
    },
    onError: (error) => notifyError(error, "Could not record this"),
  })

  const saveReservation = useMutation({
    mutationFn: async () => {
      if (!reserve || !programId) throw new Error("Choose a programme first.")
      const amount = reserveAmount.trim() ? parseAmount(reserveAmount, { allowZero: true }) : 0
      if (amount == null) throw new Error("Enter a number.")
      if (amount === 0) {
        if (reserve.current) {
          const { error } = await db.from("den_inventory_reservations").delete().eq("id", reserve.current.id)
          if (error) throw error
        }
        return 0
      }
      const { error } = await db.from("den_inventory_reservations")
        .upsert([{ item_id: reserve.item.id, program_id: programId, quantity: amount, created_by: currentUserId }], { onConflict: "item_id,program_id" })
      if (error) throw error
      return amount
    },
    onSuccess: (amount) => { refresh(); setReserve(null); toast.success(amount === 0 ? "Reservation released" : "Stock reserved") },
    onError: (error) => notifyError(error, "Could not reserve this stock"),
  })

  const list = items.data?.items ?? []
  const reservations = items.data?.reservations ?? []
  const reservedFor = (itemId: string) => reservations.filter(row => row.item_id === itemId).reduce((sum, row) => sum + Number(row.quantity), 0)
  const reservationHere = (itemId: string) => reservations.find(row => row.item_id === itemId && row.program_id === programId) ?? null
  const low = list.filter(item => stockLevel(item) === "low").length
  const out = list.filter(item => stockLevel(item) === "out").length
  // Usage is tied to a programme for members; coordinators may also record it without one.
  const canUse = canCoordinate || (isMember && scoped)

  const openItem = (item: DenInventoryItem | null) => {
    setItemForm(item
      ? { name: item.name, category: item.category ?? "", unit: item.unit, reorder_level: Number(item.reorder_level) ? formatQuantity(item.reorder_level) : "", storage_location: item.storage_location ?? "", notes: item.notes ?? "" }
      : EMPTY_ITEM)
    setItemDialog({ editing: item })
  }
  const openMove = (item: DenInventoryItem, type: StockMovementType) => { setMoveForm({ amount: "", note: "" }); setMove({ item, type }) }

  const typed = move ? parseAmount(moveForm.amount, { allowNegative: move.type === "adjust", allowZero: move.type === "count" }) : null
  const preview = move && typed != null ? previewMovement(move.item, move.type, typed) : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Items" value={list.length} icon={Boxes} tone="primary" />
        <StatCard label="Low stock" value={low} hint={low ? "At or below reorder level" : "None"} icon={AlertTriangle} tone={low ? "warning" : "neutral"} />
        <StatCard label="Out of stock" value={out} hint={out ? "Nothing left" : "None"} icon={AlertTriangle} tone={out ? "destructive" : "neutral"} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Boxes className="h-5 w-5" aria-hidden="true" />
              Inventory
              {programName && <Badge variant="outline">Usage and reservations for {programName}</Badge>}
            </CardTitle>
            <CardDescription>
              {canUse
                ? "Record what is used as it is used, and the count stays right."
                : isMember ? "Choose a programme you are on to record usage." : "Stock held by November (Den)."}
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <DenBulkStock currentUserId={currentUserId} existingNames={(items.data?.items ?? []).map(item => item.name)} />
              <Button size="sm" className="shrink-0" onClick={() => openItem(null)}>
                <Plus aria-hidden="true" />
                Add item
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {items.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}</div>
          ) : items.isError ? (
            <ErrorState title="Could not load inventory" onRetry={() => items.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon={Boxes} title="No stock items yet" description={canManage ? "Add what the Den keeps — water, towels, glasses, tableware — then receive stock to set each count." : "The Team Lead adds stock items here."} className="py-10" />
          ) : (
            <ul className="divide-y rounded-xl border">
              {list.map(item => {
                const level = stockLevel(item)
                const reserved = reservedFor(item.id)
                const here = reservationHere(item.id)
                return (
                  <li key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 sm:flex sm:flex-nowrap">
                    <div className="min-w-0 sm:flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {item.name}
                        {level === "out" && <Badge variant="destructive">Out of stock</Badge>}
                        {level === "low" && <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400">Low</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[item.category, item.storage_location].filter(Boolean).join(" · ") || "Uncategorised"}
                        {Number(item.reorder_level) > 0 && ` · reorder at ${formatQuantity(item.reorder_level)}`}
                        {reserved > 0 && ` · ${formatQuantity(reserved)} reserved, ${formatQuantity(availableStock(item, reserved))} free`}
                        {here && ` · ${formatQuantity(here.quantity)} for this programme`}
                      </p>
                    </div>
                    <p className={cn("shrink-0 text-right", level === "out" ? "text-destructive dark:text-red-400" : level === "low" ? "text-amber-600 dark:text-amber-400" : "")}>
                      <span className="stat-figure text-xl font-bold tabular-nums">{formatQuantity(item.quantity)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{item.unit}</span>
                    </p>
                    {/* On a phone the actions take their own full-width row, sized for a thumb. */}
                    <div className="col-span-2 flex shrink-0 items-center gap-2 sm:col-span-1">
                      {canUse && (
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={level === "out"} onClick={() => openMove(item, "use")}>
                          <Minus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Use
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => openMove(item, "receive")}>
                          <PackagePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Receive
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-label={`More for ${item.name}`} size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setHistoryOf(item)}>History</DropdownMenuItem>
                          {canCoordinate && scoped && (
                            <DropdownMenuItem onSelect={() => { setReserveAmount(here ? formatQuantity(here.quantity) : ""); setReserve({ item, current: here }) }}>
                              {here ? "Change reservation" : "Reserve for this programme"}
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => openMove(item, "count")}>Stock count</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openMove(item, "adjust")}>Adjust with a reason</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openItem(item)}>Edit item</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(move)} onOpenChange={(open) => { if (!open) setMove(null) }}>
        <DialogContent className="max-w-md">
          {move && (
            <>
              <DialogHeader>
                <DialogTitle>{MOVEMENT_COPY[move.type].title}: {move.item.name}</DialogTitle>
                <DialogDescription>
                  {formatQuantity(move.item.quantity)} {move.item.unit} in stock now
                  {move.type === "use" && programName ? ` · for ${programName}` : ""}
                  {move.type === "count" ? ". Enter what you counted; the difference is recorded for you." : ""}
                </DialogDescription>
              </DialogHeader>
              <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (preview?.ok && !record.isPending) record.mutate() }}>
                <div className="space-y-2">
                  <Label htmlFor="den-stock-amount">{MOVEMENT_COPY[move.type].field} *</Label>
                  <Input id="den-stock-amount" autoFocus inputMode="decimal" required value={moveForm.amount} onChange={(event) => setMoveForm({ ...moveForm, amount: event.target.value })} />
                  <p className={cn("text-xs", preview && !preview.ok ? "text-destructive dark:text-red-400" : "text-muted-foreground")} aria-live="polite">
                    {!moveForm.amount.trim() ? " "
                      : !preview ? "Enter a number with at most two decimal places."
                      : preview.ok ? `Stock will be ${formatQuantity(preview.after)} ${move.item.unit}${move.type === "count" && preview.change !== 0 ? ` (${preview.change > 0 ? "+" : ""}${formatQuantity(preview.change)} against the record)` : ""}.`
                      : preview.reason}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="den-stock-note">{move.type === "adjust" ? "Reason *" : "Note"}</Label>
                  <Textarea id="den-stock-note" rows={2} maxLength={300} required={move.type === "adjust"} placeholder={move.type === "adjust" ? "e.g., Six glasses broken during set-up" : undefined} value={moveForm.note} onChange={(event) => setMoveForm({ ...moveForm, note: event.target.value })} />
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  {canManage && move.type === "count" ? (
                    <Button type="button" variant="ghost" onClick={() => openMove(move.item, "adjust")}>Adjust instead</Button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setMove(null)}>Cancel</Button>
                    <Button type="submit" pending={record.isPending} disabled={!preview?.ok || (move.type === "adjust" && !moveForm.note.trim())}>{MOVEMENT_COPY[move.type].button}</Button>
                  </div>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reserve)} onOpenChange={(open) => { if (!open) setReserve(null) }}>
        <DialogContent className="max-w-md">
          {reserve && (
            <>
              <DialogHeader>
                <DialogTitle>Reserve {reserve.item.name}</DialogTitle>
                <DialogDescription>
                  For {programName ?? "this programme"}. {formatQuantity(availableStock(reserve.item, reservedFor(reserve.item.id) - Number(reserve.current?.quantity ?? 0)))} {reserve.item.unit} are free to reserve. Recording usage for the programme draws the reservation down.
                </DialogDescription>
              </DialogHeader>
              <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!saveReservation.isPending) saveReservation.mutate() }}>
                <div className="space-y-2">
                  <Label htmlFor="den-reserve-amount">Set aside ({reserve.item.unit})</Label>
                  <Input id="den-reserve-amount" autoFocus inputMode="decimal" placeholder="0 releases the reservation" value={reserveAmount} onChange={(event) => setReserveAmount(event.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setReserve(null)}>Cancel</Button>
                  <Button type="submit" pending={saveReservation.isPending}>Save</Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(itemDialog)} onOpenChange={(open) => { if (!open) setItemDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{itemDialog?.editing ? "Edit item" : "Add a stock item"}</DialogTitle>
            <DialogDescription>
              {itemDialog?.editing ? "The count is changed by recording a movement, not here." : "It starts at zero. Receive stock next to set the count."}
            </DialogDescription>
          </DialogHeader>
          <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); if (itemForm.name.trim() && !saveItem.isPending) saveItem.mutate() }}>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <div className="space-y-2">
                <Label htmlFor="den-item-name">Item *</Label>
                <Input id="den-item-name" required maxLength={120} placeholder="e.g., Bottled water 50cl" value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-item-unit">Unit *</Label>
                <Input id="den-item-unit" required maxLength={20} placeholder="pcs, packs" value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-item-category">Category</Label>
                <Input id="den-item-category" maxLength={60} placeholder="Drinks, Linen, Tableware" value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-item-reorder">Warn me at</Label>
                <Input id="den-item-reorder" inputMode="decimal" placeholder="Reorder level" value={itemForm.reorder_level} onChange={(event) => setItemForm({ ...itemForm, reorder_level: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-item-location">Where it is kept</Label>
              <Input id="den-item-location" maxLength={120} value={itemForm.storage_location} onChange={(event) => setItemForm({ ...itemForm, storage_location: event.target.value })} />
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              {itemDialog?.editing ? (
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={retireItem.isPending} onClick={() => retireItem.mutate(itemDialog.editing!)}>Retire item</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setItemDialog(null)}>Cancel</Button>
                <Button type="submit" pending={saveItem.isPending} disabled={!itemForm.name.trim()}>{itemDialog?.editing ? "Save item" : "Add item"}</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyOf)} onOpenChange={(open) => { if (!open) setHistoryOf(null) }}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{historyOf?.name}: history</DialogTitle>
            <DialogDescription>Every change to this item&apos;s count, newest first.</DialogDescription>
          </DialogHeader>
          {history.isLoading ? <Skeleton className="h-24 rounded-xl" /> : history.isError ? (
            <ErrorState title="Could not load the history" onRetry={() => history.refetch()} className="py-6" />
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {(history.data ?? []).map(row => (
                <li key={row.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {STOCK_MOVEMENT_LABEL[row.movement_type] ?? row.movement_type}
                      <span className={cn("ml-2 tabular-nums", Number(row.change) < 0 ? "text-destructive dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                        {Number(row.change) > 0 ? "+" : ""}{formatQuantity(row.change)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.author?.full_name ?? "An officer"} · {format(new Date(row.created_at), "d MMM yyyy, HH:mm")}
                      {row.program?.name && ` · ${row.program.name}`}
                    </p>
                    {row.note && <p className="mt-0.5 text-xs">{row.note}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">left {formatQuantity(row.balance_after)}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
