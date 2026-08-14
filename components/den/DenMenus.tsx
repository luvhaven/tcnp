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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { UtensilsCrossed, Plus, Pencil, Trash2, Star, CalendarDays } from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

export type ProgramMenu = {
  id: string
  program_id: string | null
  menu_date: string
  meal_type: string
  title: string
  items: string[]
  notes: string | null
  is_menu_of_day: boolean
  created_by: string | null
  programs?: { name: string } | null
}

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snacks", label: "Snacks" },
  { value: "all_day", label: "All Day" },
]

type Props = {
  canEdit: boolean
  selectedProgram: string // 'all' or program id
  currentUserId?: string | null
}

export default function DenMenus({ canEdit, selectedProgram, currentUserId }: Props) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProgramMenu | null>(null)
  const [form, setForm] = useState({
    title: "",
    program_id: "",
    menu_date: new Date().toISOString().slice(0, 10),
    meal_type: "lunch",
    itemsText: "",
    notes: "",
    is_menu_of_day: false,
  })

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
  })

  const { data: menus = [], isLoading } = useQuery({
    queryKey: ["program-menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_menus")
        .select("*, programs(name)")
        .order("menu_date", { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((m: any) => ({
        ...m,
        items: Array.isArray(m.items) ? m.items : [],
      })) as ProgramMenu[]
    },
  })

  const today = new Date().toISOString().slice(0, 10)
  const filtered = useMemo(
    () => menus.filter(m => selectedProgram === "all" || m.program_id === selectedProgram),
    [menus, selectedProgram]
  )
  const menuOfDay = useMemo(
    () => filtered.filter(m => m.menu_date === today && (m.is_menu_of_day || true)).sort((a, b) => Number(b.is_menu_of_day) - Number(a.is_menu_of_day)),
    [filtered, today]
  )
  const upcoming = useMemo(() => filtered.filter(m => m.menu_date !== today), [filtered, today])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = form.itemsText.split("\n").map(s => s.trim()).filter(Boolean)
      const payload = {
        title: form.title.trim(),
        program_id: form.program_id || null,
        menu_date: form.menu_date,
        meal_type: form.meal_type,
        items,
        notes: form.notes.trim() || null,
        is_menu_of_day: form.is_menu_of_day,
        updated_at: new Date().toISOString(),
      }
      if (!payload.title) throw new Error("Menu title is required")
      if (editing) {
        const { error } = await supabase.from("program_menus").update(payload).eq("id", editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("program_menus").insert({ ...payload, created_by: currentUserId ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Menu updated" : "Menu published")
      setDialogOpen(false)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["program-menus"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to save menu"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("program_menus").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Menu removed")
      queryClient.invalidateQueries({ queryKey: ["program-menus"] })
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete menu"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({
      title: "",
      program_id: selectedProgram !== "all" ? selectedProgram : "",
      menu_date: today,
      meal_type: "lunch",
      itemsText: "",
      notes: "",
      is_menu_of_day: false,
    })
    setDialogOpen(true)
  }

  const openEdit = (menu: ProgramMenu) => {
    setEditing(menu)
    setForm({
      title: menu.title,
      program_id: menu.program_id ?? "",
      menu_date: menu.menu_date,
      meal_type: menu.meal_type,
      itemsText: menu.items.join("\n"),
      notes: menu.notes ?? "",
      is_menu_of_day: menu.is_menu_of_day,
    })
    setDialogOpen(true)
  }

  const MenuCard = ({ menu, highlight = false }: { menu: ProgramMenu; highlight?: boolean }) => (
    <Card className={`card-hover h-full ${highlight ? "border-primary/40 bg-gradient-to-br from-primary/5 to-transparent" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {menu.is_menu_of_day && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />}
              <span className="truncate">{menu.title}</span>
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant="secondary" className="text-[10px] uppercase">{MEAL_TYPES.find(m => m.value === menu.meal_type)?.label ?? menu.meal_type}</Badge>
              {menu.programs?.name && <Badge variant="outline" className="text-[10px]">{menu.programs.name}</Badge>}
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3" />{menu.menu_date}
              </span>
            </CardDescription>
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(menu)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                onClick={async () => {
                  const ok = await confirm({ title: "Delete menu?", message: `"${menu.title}" will be removed for everyone.` })
                  if (ok) deleteMutation.mutate(menu.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {menu.items.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {menu.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No items listed.</p>
        )}
        {menu.notes && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{menu.notes}</p>}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <UtensilsCrossed className="h-5 w-5 text-primary" /> Den Menus
          </h3>
          <p className="text-sm text-muted-foreground">Menu of the day and per-program meal plans, curated with Welfare.</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> Add Menu
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-xl" />)}
        </div>
      ) : (
        <>
          {menuOfDay.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {menuOfDay.map(menu => (
                    <motion.div key={menu.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <MenuCard menu={menu} highlight={menu.is_menu_of_day} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Program Menus</p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map(menu => <MenuCard key={menu.id} menu={menu} />)}
              </div>
            </div>
          )}

          {menuOfDay.length === 0 && upcoming.length === 0 && (
            <div className="empty-state rounded-xl border">
              <UtensilsCrossed className="h-10 w-10" />
              <p className="font-medium">No menus published</p>
              <p className="text-sm text-muted-foreground">Welfare and November (Theatre) can publish the menu of the day here.</p>
            </div>
          )}
        </>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Menu" : "Publish Menu"}</DialogTitle>
            <DialogDescription>Officers see published menus instantly on the Den board.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}
            className="mt-2 space-y-4"
          >
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Day 2 — Jollof Special" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.menu_date} onChange={(e) => setForm({ ...form, menu_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Meal *</Label>
                <Select value={form.meal_type} onValueChange={(v) => setForm({ ...form, meal_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Program</Label>
              <Select value={form.program_id || "none"} onValueChange={(v) => setForm({ ...form, program_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="General (no program)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (no program)</SelectItem>
                  {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Items (one per line) *</Label>
              <Textarea rows={5} value={form.itemsText} onChange={(e) => setForm({ ...form, itemsText: e.target.value })} placeholder={"Jollof rice with grilled chicken\nFried plantain\nChapman"} required />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Allergen info, serving times…" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Menu of the Day</p>
                <p className="text-xs text-muted-foreground">Pins this menu to the top of the Den board.</p>
              </div>
              <Switch checked={form.is_menu_of_day} onCheckedChange={(v) => setForm({ ...form, is_menu_of_day: v })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Publish"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
