"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  DEN_VENDOR_KEY,
  VENDOR_ENGAGEMENT_STATUS_LABEL,
  formatMoney,
  parseAmount,
  ratingLabel,
  type VendorEngagementStatus,
  type VendorSummary,
} from "@/lib/den-inventory"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type VendorLite = { id: string; name: string; cuisine_note: string | null; service_categories?: string[] | null; sla_notes?: string | null }

type Props = {
  vendor: VendorLite | null
  summary: VendorSummary | null
  /** May edit the price list and usage history (the roles that edit vendors). */
  canEdit: boolean
  /** May add their own rating (a Den member or a vendor editor). */
  canRate: boolean
  currentUserId: string | null
  programs: { id: string; name: string }[]
  selectedProgram: string // 'all' or a program id
  onClose: () => void
}

type PriceItem = { id: string; item: string; unit: string | null; price: number; currency: string; note: string | null }
type Engagement = { id: string; program_id: string | null; service: string; amount: number | null; currency: string; status: VendorEngagementStatus; notes: string | null; created_at: string }
type Rating = { id: string; program_id: string | null; rating: number; comment: string | null; created_by: string; created_at: string; author: { full_name: string | null } | null }

export function Stars({ value, onChange, size = "h-4 w-4" }: { value: number; onChange?: (next: number) => void; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? "radiogroup" : "img"} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map(star => {
        const filled = star <= Math.round(value)
        const icon = <Star className={cn(size, filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} aria-hidden="true" />
        return onChange ? (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            onClick={() => onChange(star)}
            className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {icon}
          </button>
        ) : <span key={star}>{icon}</span>
      })}
    </span>
  )
}

/**
 * Everything the Den knows about one vendor beyond the contact card: what they
 * charge, the service level agreed, where they have been used, and how
 * officers rated them. Ratings are open to every officer; prices and spend to
 * the people who work with vendors.
 */
export default function VendorDetails({ vendor, summary, canEdit, canRate, currentUserId, programs, selectedProgram, onClose }: Props) {
  const supabase = createClient()
  const db = supabase as any
  const queryClient = useQueryClient()
  const vendorId = vendor?.id ?? null

  const [price, setPrice] = useState({ item: "", unit: "", price: "" })
  const [usage, setUsage] = useState({ service: "", amount: "", status: "planned" as VendorEngagementStatus })
  const [rating, setRating] = useState({ stars: 0, comment: "" })

  const programName = (id: string | null) => programs.find(program => program.id === id)?.name ?? null
  const programForNew = selectedProgram === "all" ? null : selectedProgram
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DEN_VENDOR_KEY })
    queryClient.invalidateQueries({ queryKey: ["vendors", "summaries"] })
  }

  const prices = useQuery({
    queryKey: [...DEN_VENDOR_KEY, "prices", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async () => {
      const { data, error } = await db.from("vendor_price_items").select("id, item, unit, price, currency, note").eq("vendor_id", vendorId).order("item")
      if (error) throw error
      return (data ?? []) as PriceItem[]
    },
  })
  const engagements = useQuery({
    queryKey: [...DEN_VENDOR_KEY, "engagements", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async () => {
      const { data, error } = await db.from("vendor_engagements").select("id, program_id, service, amount, currency, status, notes, created_at").eq("vendor_id", vendorId).order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Engagement[]
    },
  })
  const ratings = useQuery({
    queryKey: [...DEN_VENDOR_KEY, "ratings", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async () => {
      const { data, error } = await db.from("vendor_ratings")
        .select("id, program_id, rating, comment, created_by, created_at, author:users!vendor_ratings_created_by_fkey(full_name)")
        .eq("vendor_id", vendorId).order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Rating[]
    },
  })

  const mutate = useMutation({
    mutationFn: async (action: { run: () => PromiseLike<{ error: unknown; data?: unknown }>; done: string; needRow?: boolean }) => {
      const { error, data } = await action.run()
      if (error) throw error
      if (action.needRow && !(data as unknown[] | null)?.length) throw new Error("You are not allowed to change this.")
      return action.done
    },
    onSuccess: (done) => { refresh(); toast.success(done) },
    onError: (error: any) => {
      if (error?.code === "23505") toast.error("You have already rated this vendor for that programme")
      else notifyError(error, "Could not save this")
    },
  })

  const addPrice = () => {
    const amount = parseAmount(price.price, { allowZero: true })
    if (!price.item.trim() || amount == null) { toast.error("Enter the item and a price"); return }
    mutate.mutate({
      run: () => db.from("vendor_price_items").insert([{ vendor_id: vendorId, item: price.item.trim(), unit: price.unit.trim() || null, price: amount, updated_by: currentUserId }]),
      done: "Price added",
    })
    setPrice({ item: "", unit: "", price: "" })
  }
  const addUsage = () => {
    const amount = usage.amount.trim() ? parseAmount(usage.amount, { allowZero: true }) : null
    if (!usage.service.trim() || (usage.amount.trim() && amount == null)) { toast.error("Say what they supplied, and check the amount"); return }
    mutate.mutate({
      run: () => db.from("vendor_engagements").insert([{ vendor_id: vendorId, program_id: programForNew, service: usage.service.trim(), amount, status: usage.status, created_by: currentUserId }]),
      done: "Added to this vendor's history",
    })
    setUsage({ service: "", amount: "", status: "planned" })
  }
  const addRating = () => {
    if (rating.stars < 1) { toast.error("Choose a number of stars"); return }
    mutate.mutate({
      run: () => db.from("vendor_ratings").insert([{ vendor_id: vendorId, program_id: programForNew, rating: rating.stars, comment: rating.comment.trim() || null, created_by: currentUserId }]),
      done: "Rating saved",
    })
    setRating({ stars: 0, comment: "" })
  }
  const remove = (table: string, id: string, done: string) =>
    mutate.mutate({ run: () => db.from(table).delete().eq("id", id).select("id"), done, needRow: true })

  const categories = vendor?.service_categories ?? []

  return (
    <Dialog open={Boolean(vendor)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {vendor && (
          <>
            <DialogHeader>
              <DialogTitle>{vendor.name}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <Stars value={summary?.average_rating ?? 0} />
                <span>{ratingLabel(summary)}</span>
                {vendor.cuisine_note && <span>· {vendor.cuisine_note}</span>}
              </DialogDescription>
            </DialogHeader>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{categories.map(category => <Badge key={category} variant="secondary">{category}</Badge>)}</div>
            )}

            <section className="mt-3 space-y-2">
              <h3 className="text-sm font-semibold">Service level agreed</h3>
              <p className="whitespace-pre-line rounded-xl border p-3 text-sm">
                {vendor.sla_notes || <span className="text-muted-foreground">Nothing recorded. Edit the vendor to add delivery times, minimum notice and what happens when an order is late.</span>}
              </p>
            </section>

            <section className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Price list</h3>
              {prices.isLoading ? <Skeleton className="h-12 rounded-xl" /> : prices.isError ? (
                <ErrorState title="Prices are not available to you" description="Prices are shown to the Den, vendor editors and leadership." className="py-6" />
              ) : (prices.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No prices recorded.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {(prices.data ?? []).map(row => (
                    <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{row.item}{row.unit && <span className="text-muted-foreground"> / {row.unit}</span>}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(row.price, row.currency)}</span>
                      {canEdit && (
                        <Button aria-label={`Remove price for ${row.item}`} variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => remove("vendor_price_items", row.id, "Price removed")}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <form className="grid gap-2 sm:grid-cols-[1fr_110px_130px_auto]" onSubmit={(event) => { event.preventDefault(); addPrice() }}>
                  <Input aria-label="Item" placeholder="Item, e.g. Jollof rice" value={price.item} onChange={(event) => setPrice({ ...price, item: event.target.value })} />
                  <Input aria-label="Unit" placeholder="per plate" value={price.unit} onChange={(event) => setPrice({ ...price, unit: event.target.value })} />
                  <Input aria-label="Price in naira" inputMode="decimal" placeholder="Price (NGN)" value={price.price} onChange={(event) => setPrice({ ...price, price: event.target.value })} />
                  <Button type="submit" variant="outline" disabled={mutate.isPending}>Add</Button>
                </form>
              )}
            </section>

            <section className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Where they have been used</h3>
              {engagements.isLoading ? <Skeleton className="h-12 rounded-xl" /> : engagements.isError ? (
                <ErrorState title="Usage history is not available to you" description="It is shown to the Den, vendor editors and leadership." className="py-6" />
              ) : (engagements.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No engagements recorded{summary?.menu_count ? `, though ${summary.menu_count} ${summary.menu_count === 1 ? "menu names" : "menus name"} this vendor` : ""}.
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {(engagements.data ?? []).map(row => (
                    <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block truncate font-medium">{row.service}</span>
                        <span className="block text-xs text-muted-foreground">{programName(row.program_id) ?? "No programme"} · {format(new Date(row.created_at), "d MMM yyyy")}</span>
                      </span>
                      {row.amount != null && <span className="shrink-0 tabular-nums">{formatMoney(row.amount, row.currency)}</span>}
                      {canEdit ? (
                        <Select value={row.status} onValueChange={(value) => mutate.mutate({ run: () => db.from("vendor_engagements").update({ status: value }).eq("id", row.id).select("id"), done: "Status updated", needRow: true })}>
                          <SelectTrigger className="h-8 w-[130px] shrink-0" aria-label={`Status of ${row.service}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(VENDOR_ENGAGEMENT_STATUS_LABEL) as VendorEngagementStatus[]).map(status => <SelectItem key={status} value={status}>{VENDOR_ENGAGEMENT_STATUS_LABEL[status]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : <Badge variant="outline" className="shrink-0">{VENDOR_ENGAGEMENT_STATUS_LABEL[row.status]}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <form className="grid gap-2 sm:grid-cols-[1fr_140px_130px_auto]" onSubmit={(event) => { event.preventDefault(); addUsage() }}>
                  <Input aria-label="What they supplied" placeholder={programForNew ? `Supplied for ${programName(programForNew) ?? "this programme"}` : "What they supplied"} value={usage.service} onChange={(event) => setUsage({ ...usage, service: event.target.value })} />
                  <Input aria-label="Amount in naira" inputMode="decimal" placeholder="Amount (NGN)" value={usage.amount} onChange={(event) => setUsage({ ...usage, amount: event.target.value })} />
                  <Select value={usage.status} onValueChange={(value) => setUsage({ ...usage, status: value as VendorEngagementStatus })}>
                    <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VENDOR_ENGAGEMENT_STATUS_LABEL) as VendorEngagementStatus[]).map(status => <SelectItem key={status} value={status}>{VENDOR_ENGAGEMENT_STATUS_LABEL[status]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="submit" variant="outline" disabled={mutate.isPending}>Add</Button>
                </form>
              )}
            </section>

            <section className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Ratings</h3>
              {canRate && (
                <form className="space-y-2 rounded-xl border p-3" onSubmit={(event) => { event.preventDefault(); addRating() }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="text-xs">Your rating{programForNew ? ` for ${programName(programForNew) ?? "this programme"}` : ""}</Label>
                    <Stars value={rating.stars} onChange={(stars) => setRating({ ...rating, stars })} size="h-5 w-5" />
                  </div>
                  <Textarea aria-label="Comment" rows={2} maxLength={500} placeholder="What should the next team know about ordering from them?" value={rating.comment} onChange={(event) => setRating({ ...rating, comment: event.target.value })} />
                  <div className="flex justify-end"><Button type="submit" size="sm" disabled={mutate.isPending || rating.stars < 1}>Save rating</Button></div>
                </form>
              )}
              {ratings.isLoading ? <Skeleton className="h-12 rounded-xl" /> : (ratings.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No ratings yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(ratings.data ?? []).map(row => (
                    <li key={row.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Stars value={row.rating} />
                        {row.created_by === currentUserId && (
                          <Button aria-label="Remove your rating" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove("vendor_ratings", row.id, "Rating removed")}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                      {row.comment && <p className="mt-1 whitespace-pre-line text-sm">{row.comment}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.author?.full_name ?? "An officer"} · {format(new Date(row.created_at), "d MMM yyyy")}
                        {programName(row.program_id) && ` · ${programName(row.program_id)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
