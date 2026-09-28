"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Store, Plus, Pencil, Trash2, Phone, Mail, User } from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

export type Vendor = {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  cuisine_note: string | null
  is_active: boolean
  created_by: string | null
}

type Props = {
  canEdit: boolean
  currentUserId?: string | null
}

const emptyForm = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  cuisine_note: "",
  is_active: true,
}

export default function VendorDirectory({ canEdit, currentUserId }: Props) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      // `vendors` is newer than types/supabase.ts, which is missing ~25 tables
      // from the Sept 2026 migrations — same cast as training/page.tsx:136.
      const { data, error } = await (supabase as any)
        .from("vendors")
        .select("id, name, contact_name, phone, email, cuisine_note, is_active, created_by")
        .order("name")
      if (error) throw error
      return (data ?? []) as Vendor[]
    },
  })

  const visible = useMemo(
    () => vendors.filter(v => showRetired || v.is_active),
    [vendors, showRetired]
  )
  const retiredCount = useMemo(() => vendors.filter(v => !v.is_active).length, [vendors])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim()
      if (!name) throw new Error("Vendor name is required")
      const payload = {
        name,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        cuisine_note: form.cuisine_note.trim() || null,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await (supabase as any).from("vendors").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from("vendors")
          .insert({ ...payload, created_by: currentUserId ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Vendor updated" : "Vendor added")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["vendors"] })
      // A renamed or retired vendor changes how menu cards read.
      queryClient.invalidateQueries({ queryKey: ["program-menus"] })
    },
    onError: (err: any) => {
      // The case-insensitive unique index is the likeliest failure here, and
      // "duplicate key value violates unique constraint" tells an officer nothing.
      const message = err?.code === "23505" || /duplicate key/i.test(err?.message ?? "")
        ? "A vendor with that name already exists"
        : err?.message || "Failed to save vendor"
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("vendors").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Vendor removed")
      queryClient.invalidateQueries({ queryKey: ["vendors"] })
      queryClient.invalidateQueries({ queryKey: ["program-menus"] })
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete vendor"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (vendor: Vendor) => {
    setEditing(vendor)
    setForm({
      name: vendor.name,
      contact_name: vendor.contact_name ?? "",
      phone: vendor.phone ?? "",
      email: vendor.email ?? "",
      cuisine_note: vendor.cuisine_note ?? "",
      is_active: vendor.is_active,
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Store className="h-5 w-5 text-primary" /> Vendors
          </h3>
          <p className="text-sm text-muted-foreground">
            Who supplies each menu. Retire a vendor instead of deleting it to keep past menus readable.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {retiredCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="show-retired-vendors" checked={showRetired} onCheckedChange={setShowRetired} />
              <Label htmlFor="show-retired-vendors" className="text-xs text-muted-foreground">
                Show retired ({retiredCount})
              </Label>
            </div>
          )}
          {canEdit && (
            <Button size="sm" onClick={openCreate} className="gap-1">
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state rounded-xl border">
          <Store className="h-10 w-10" />
          <p className="font-medium">No vendors yet</p>
          <p className="text-sm text-muted-foreground">
            Add the caterers November orders from, then pick one when publishing a menu.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {visible.map(vendor => (
              <motion.div key={vendor.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className={`card-hover h-full ${vendor.is_active ? "" : "opacity-60"}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{vendor.name}</CardTitle>
                        <CardDescription className="mt-1 flex flex-wrap items-center gap-1">
                          {!vendor.is_active && <Badge variant="outline" className="text-[10px] uppercase">Retired</Badge>}
                          {vendor.cuisine_note && (
                            <span className="text-[11px] text-muted-foreground">{vendor.cuisine_note}</span>
                          )}
                        </CardDescription>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(vendor)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete vendor?",
                                message: `"${vendor.name}" will be removed. Menus that used it stay, with no vendor set. Retire it instead if you may order from them again.`,
                              })
                              if (ok) deleteMutation.mutate(vendor.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 pt-0 text-sm">
                    {vendor.contact_name && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3.5 w-3.5 shrink-0" />{vendor.contact_name}
                      </p>
                    )}
                    {vendor.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <a href={`tel:${vendor.phone}`} className="hover:underline">{vendor.phone}</a>
                      </p>
                    )}
                    {vendor.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <a href={`mailto:${vendor.email}`} className="truncate hover:underline">{vendor.email}</a>
                      </p>
                    )}
                    {!vendor.contact_name && !vendor.phone && !vendor.email && (
                      <p className="text-muted-foreground">No contact details recorded.</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
            <DialogDescription>Vendors can be picked when publishing a menu.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }} className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vendor-name">Name *</Label>
              <Input
                id="vendor-name" value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Mama Put Kitchen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-contact">Contact person</Label>
              <Input
                id="vendor-contact" value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="Who November calls"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="vendor-phone">Phone</Label>
                <Input
                  id="vendor-phone" type="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0800 000 0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-email">Email</Label>
                <Input
                  id="vendor-email" type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="orders@vendor.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-cuisine">What they supply</Label>
              <Textarea
                id="vendor-cuisine" rows={2} value={form.cuisine_note}
                onChange={(e) => setForm({ ...form, cuisine_note: e.target.value })}
                placeholder="Continental, small chops, drinks…"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Retired vendors stay on past menus but cannot be picked.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add Vendor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
