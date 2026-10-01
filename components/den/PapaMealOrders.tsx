"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  MEAL_TYPES, buildOrderPayload, dietaryNotes, findExistingOrder, hasDietaryRestriction,
  menuForSlot, menuItemsForSlot, normalizeSelectedItems, orderProgress, papaDisplayName, toggleItem,
  type MenuForSlot, type OrderStatus, type OrderablePapa, type PapaMealOrder,
} from "@/lib/papa-meal-orders"
import {
  ClipboardList, Check, ChevronDown, Store, Utensils, ShieldAlert, Loader2, Send, Undo2,
} from "lucide-react"

const supabase = createClient()

// `papa_meal_orders` postdates types/supabase.ts — same cast as DenMenus.tsx uses
// for `vendors`.
const db = supabase as any

// The table arrives with #73's migration. If the client ships first, an empty
// list would read as "no orders taken yet" instead of "this is not live yet" —
// the exact way the vendors rollout misled on /den — so the code below tells
// the two apart and says so on screen.
const SCHEMA_NOT_READY = ["PGRST200", "PGRST204", "PGRST205", "42703", "42P01"]
const isSchemaNotReady = (error: { code?: string } | null | undefined) =>
  !!error && SCHEMA_NOT_READY.includes(error.code ?? "")

type Props = {
  canOrder: boolean
  selectedProgram: string // 'all' or a program id
  currentUserId?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Sent to vendor",
  fulfilled: "Served",
  cancelled: "Cancelled",
}

export default function PapaMealOrders({ canOrder, selectedProgram, currentUserId }: Props) {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [orderDate, setOrderDate] = useState(today)
  const [mealType, setMealType] = useState<string>("lunch")
  const [openPapaId, setOpenPapaId] = useState<string | null>(null)
  const [draftItems, setDraftItems] = useState<string[]>([])
  const [draftNote, setDraftNote] = useState("")

  const papasQuery = useQuery({
    queryKey: ["papa-meal-order-papas", selectedProgram],
    queryFn: async () => {
      // Straight at `papas` so the stage-scoped RLS decides who is listed, and
      // because the dietary columns are not on the papas_basic view.
      let query = db
        .from("papas")
        .select("id, program_id, title, full_name, dietary_restrictions, food_preferences, special_requirements")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("full_name", { ascending: true })
        .limit(180)
      if (selectedProgram !== "all") query = query.eq("program_id", selectedProgram)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as OrderablePapa[]
    },
  })

  const menusQuery = useQuery({
    queryKey: ["papa-meal-order-menus", selectedProgram, orderDate],
    queryFn: async () => {
      let query = db
        .from("program_menus")
        .select("id, program_id, menu_date, meal_type, title, items, vendors(id, name, is_active)")
        .eq("menu_date", orderDate)
      if (selectedProgram !== "all") query = query.eq("program_id", selectedProgram)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as MenuForSlot[]
    },
  })

  const ordersQuery = useQuery({
    queryKey: ["papa-meal-orders", selectedProgram, orderDate],
    queryFn: async () => {
      let query = db.from("papa_meal_orders").select("*").eq("order_date", orderDate)
      if (selectedProgram !== "all") query = query.eq("program_id", selectedProgram)
      const { data, error } = await query
      if (error) {
        if (isSchemaNotReady(error)) return { orders: [] as PapaMealOrder[], schemaReady: false }
        throw error
      }
      return { orders: (data ?? []) as PapaMealOrder[], schemaReady: true }
    },
  })

  // Memoised because the `?? []` fallbacks would otherwise hand a fresh array to
  // the memos below on every render while a query is still loading or errored.
  const orders = useMemo(() => ordersQuery.data?.orders ?? [], [ordersQuery.data])
  const schemaReady = ordersQuery.data?.schemaReady !== false
  const papas = useMemo(() => papasQuery.data ?? [], [papasQuery.data])
  const menus = useMemo(() => menusQuery.data ?? [], [menusQuery.data])

  const availableItems = useMemo(
    () => menuItemsForSlot(menus, orderDate, mealType),
    [menus, orderDate, mealType]
  )
  const slotMenu = useMemo(() => menuForSlot(menus, orderDate, mealType), [menus, orderDate, mealType])
  const progress = useMemo(
    () => orderProgress(papas, orders, orderDate, mealType),
    [papas, orders, orderDate, mealType]
  )

  const saveMutation = useMutation({
    mutationFn: async ({ papaId, status }: { papaId: string; status: OrderStatus }) => {
      const papa = papas.find(p => p.id === papaId)
      const payload = buildOrderPayload({
        papaId,
        programId: papa?.program_id ?? (selectedProgram !== "all" ? selectedProgram : null),
        menuId: slotMenu?.id ?? null,
        date: orderDate,
        mealType,
        selectedItems: draftItems,
        note: draftNote,
        status,
        takenBy: currentUserId ?? null,
      })
      // Upsert on the unique index, so re-ordering for the same Papa, date and
      // meal updates the order already taken instead of raising 23505.
      const { error } = await db
        .from("papa_meal_orders")
        .upsert(payload, { onConflict: "papa_id,order_date,meal_type" })
      if (error) {
        if (isSchemaNotReady(error)) {
          throw new Error("Meal ordering is unavailable until its database migration is applied.")
        }
        throw error
      }
      return status
    },
    onSuccess: (status) => {
      toast.success(status === "submitted" ? "Order sent to the vendor" : "Order saved")
      setOpenPapaId(null)
      queryClient.invalidateQueries({ queryKey: ["papa-meal-orders"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to save the order"),
  })

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await db
        .from("papa_meal_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", orderId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Order cancelled")
      setOpenPapaId(null)
      queryClient.invalidateQueries({ queryKey: ["papa-meal-orders"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to cancel the order"),
  })

  const openPapa = (papa: OrderablePapa) => {
    if (openPapaId === papa.id) {
      setOpenPapaId(null)
      return
    }
    const existing = findExistingOrder(orders, papa.id, orderDate, mealType)
    setDraftItems(normalizeSelectedItems(existing?.selected_items))
    setDraftNote(existing?.note ?? "")
    setOpenPapaId(papa.id)
  }

  // Re-reads the order rather than toggling against stale draft state when the
  // day or meal changed underneath an open Papa.
  const changeSlot = (next: { date?: string; meal?: string }) => {
    if (next.date !== undefined) setOrderDate(next.date)
    if (next.meal !== undefined) setMealType(next.meal)
    setOpenPapaId(null)
  }

  const toggleDraftItem = (label: string) => setDraftItems(current => toggleItem(current, label))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" /> Meal orders
        </h3>
        <p className="text-sm text-muted-foreground">
          Take each Papa&apos;s order at their chair, then send the day&apos;s list to the vendor.
        </p>
      </div>

      {/* Day and meal stay reachable with a thumb while the list scrolls. */}
      <div className="sticky top-0 z-10 grid gap-3 rounded-xl border bg-background/95 p-3 backdrop-blur sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="meal-order-date" className="text-xs">Day</Label>
          <Input
            id="meal-order-date" type="date" value={orderDate} className="h-11"
            onChange={event => changeSlot({ date: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Meal</Label>
          <Select value={mealType} onValueChange={value => changeSlot({ meal: value })}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEAL_TYPES.map(meal => (
                <SelectItem key={meal.value} value={meal.value} className="py-3">{meal.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-1 text-sm">
          <Badge variant="secondary" className="tabular-nums">{progress.taken}/{progress.total} ordered</Badge>
          {slotMenu?.vendors?.name && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Store className="h-3 w-3" />{slotMenu.vendors.name}
              {slotMenu.vendors.is_active === false && " (retired)"}
            </span>
          )}
        </div>
      </div>

      {!schemaReady && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          Meal ordering is not live on this environment yet — its database migration has not been applied.
          Orders cannot be taken or read until it is.
        </p>
      )}

      {ordersQuery.isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Orders could not be loaded.{" "}
          <button type="button" className="underline" onClick={() => void ordersQuery.refetch()}>Try again</button>
        </p>
      )}

      {availableItems.length === 0 && schemaReady && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No menu is published for this day and meal. You can still record what a Papa asked for as a note.
        </p>
      )}

      {papasQuery.isLoading || ordersQuery.isLoading ? (
        <div className="flex justify-center rounded-xl border py-14"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : papas.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <Utensils className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No Papas to order for in this view</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {papas.map(papa => {
            const existing = findExistingOrder(orders, papa.id, orderDate, mealType)
            const isOpen = openPapaId === papa.id
            const ordered = !!existing && existing.status !== "cancelled"
            return (
              <li key={papa.id} className="overflow-hidden rounded-xl border bg-card">
                {/* The whole row is the target — a 56px bar, not an icon to aim at. */}
                <button
                  type="button"
                  onClick={() => openPapa(papa)}
                  aria-expanded={isOpen}
                  className="flex min-h-[56px] w-full items-center gap-3 p-4 text-left"
                >
                  <span
                    aria-hidden
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ordered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {ordered ? <Check className="h-4 w-4" /> : <Utensils className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{papaDisplayName(papa)}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {existing ? `${STATUS_LABEL[existing.status] ?? existing.status} · ${normalizeSelectedItems(existing.selected_items).length} item(s)` : "No order taken"}
                    </span>
                  </span>
                  {hasDietaryRestriction(papa) && (
                    <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                      <ShieldAlert className="h-3 w-3" />Dietary
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t"
                    >
                      <div className="space-y-4 p-4">
                        {/* Dietary context stays on screen while ordering — same
                            precedence as the Nest arrivals card. */}
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="flex items-center gap-2 text-xs font-medium"><Utensils className="h-3.5 w-3.5 text-primary" />Dietary and allergy notes</p>
                          <p className="mt-1 text-sm text-muted-foreground">{dietaryNotes(papa)}</p>
                          {papa.special_requirements && (
                            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{papa.special_requirements}
                            </p>
                          )}
                        </div>

                        {availableItems.length > 0 && (
                          <ul className="space-y-2">
                            {availableItems.map(label => {
                              const checked = draftItems.includes(label)
                              return (
                                <li key={label}>
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={checked}
                                    disabled={!canOrder}
                                    onClick={() => toggleDraftItem(label)}
                                    className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg border p-3 text-left disabled:opacity-60 ${checked ? "border-primary bg-primary/5" : ""}`}
                                  >
                                    <span
                                      aria-hidden
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}
                                    >
                                      {checked && <Check className="h-4 w-4" />}
                                    </span>
                                    <span className="text-sm">{label}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}

                        <div className="space-y-1">
                          <Label htmlFor={`order-note-${papa.id}`} className="text-xs">Anything else the Papa asked for</Label>
                          <Textarea
                            id={`order-note-${papa.id}`} value={draftNote} disabled={!canOrder}
                            onChange={event => setDraftNote(event.target.value)}
                            placeholder="Less pepper, serve at 1pm…"
                          />
                        </div>

                        {canOrder && (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              type="button" variant="outline" className="h-11 flex-1"
                              disabled={saveMutation.isPending}
                              onClick={() => saveMutation.mutate({ papaId: papa.id, status: "draft" })}
                            >
                              Save draft
                            </Button>
                            <Button
                              type="button" className="h-11 flex-1 gap-2"
                              disabled={saveMutation.isPending}
                              onClick={() => saveMutation.mutate({ papaId: papa.id, status: "submitted" })}
                            >
                              <Send className="h-4 w-4" />Send to vendor
                            </Button>
                            {existing && existing.status !== "cancelled" && (
                              <Button
                                type="button" variant="ghost" className="h-11 gap-2 text-destructive"
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(existing.id)}
                              >
                                <Undo2 className="h-4 w-4" />Cancel
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
