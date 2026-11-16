"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Edit, Home, Phone, Plus, Trash2, UserCheck, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { initialsOf } from "@/components/den/DenTeam"
import { useDenTeam, type DenTeamMember } from "@/hooks/useDenTeam"
import { DEN_ACCESS_LABEL } from "@/lib/den"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

export type DenProgram = { id: string; name: string; status: string }

type DenAssignment = {
  id: string
  user_id: string
  nest_id: string | null
  program_id: string | null
  is_active: boolean
  assigned_date: string
}

type Props = {
  dens: any[]
  programs: DenProgram[]
  selectedProgram: string // 'all' or a program id
  canManage: boolean
  onOpenProfile: (member: DenTeamMember) => void
}

const EMPTY_FORM = { name: "", address: "", city: "", phone: "", email: "", rating: 5, amenities: "", program_id: "" }

/** Den lounges and the officers posted to each one. */
export default function DenLocations({ dens, programs, selectedProgram, canManage, onOpenProfile }: Props) {
  const supabase = createClient()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { data: team } = useDenTeam()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [assignTo, setAssignTo] = useState<any>(null)
  const [officerId, setOfficerId] = useState("")

  const { data: assignments = [] } = useQuery({
    queryKey: ["noscar_assignments", "den"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("noscar_assignments")
        .select("id, user_id, nest_id, program_id, is_active, assigned_date")
        // Den postings are stored under the legacy 'theatre' assignment type.
        .eq("assignment_type", "theatre")
        .order("assigned_date", { ascending: false })
      if (error) throw error
      return (data ?? []) as DenAssignment[]
    },
  })

  const members = team?.members ?? []
  const memberById = new Map(members.map(member => [member.id, member]))

  const saveDen = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        rating: Number.isFinite(form.rating) ? form.rating : 5,
        amenities: form.amenities.trim() || null,
        type: "den",
        program_id: form.program_id || null,
      }
      const query = editing
        ? (supabase as any).from("nests").update(payload).eq("id", editing.id)
        : (supabase as any).from("nests").insert([payload])
      const { error } = await query
      if (error) throw error
      return Boolean(editing)
    },
    onSuccess: (wasEdit) => {
      queryClient.invalidateQueries({ queryKey: ["nests"] })
      toast.success(wasEdit ? "Den location updated" : "Den location added")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
    },
    onError: (error) => notifyError(error, "Could not save this Den location"),
  })

  const deleteDen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nests").delete().eq("id", id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["nests"] })
      const previous = queryClient.getQueryData<any[]>(["nests"])
      queryClient.setQueryData<any[]>(["nests"], old => old?.filter(nest => nest.id !== id))
      return { previous }
    },
    onSuccess: () => toast.success("Den location deleted"),
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(["nests"], context.previous)
      notifyError(error, "Could not delete this Den location")
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["nests"] }),
  })

  const assignOfficer = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("noscar_assignments").insert([{
        user_id: officerId,
        nest_id: assignTo.id,
        assignment_type: "theatre",
        program_id: assignTo.program_id,
        is_active: true,
        assigned_date: new Date().toISOString().split("T")[0],
      }])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["noscar_assignments"] })
      toast.success("Officer assigned")
      setAssignTo(null)
      setOfficerId("")
    },
    onError: (error) => notifyError(error, "Could not assign this officer"),
  })

  const toggleAssignment = useMutation({
    mutationFn: async (assignment: DenAssignment) => {
      const { error } = await (supabase as any)
        .from("noscar_assignments")
        .update({ is_active: !assignment.is_active })
        .eq("id", assignment.id)
      if (error) throw error
      return !assignment.is_active
    },
    onSuccess: (isActive) => {
      queryClient.invalidateQueries({ queryKey: ["noscar_assignments"] })
      toast.success(isActive ? "Officer marked on duty" : "Officer marked off duty")
    },
    onError: (error) => notifyError(error, "Could not update this posting"),
  })

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("noscar_assignments").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["noscar_assignments"] })
      toast.success("Officer removed from this Den")
    },
    onError: (error) => notifyError(error, "Could not remove this officer"),
  })

  const openEdit = (den: any) => {
    setEditing(den)
    setForm({
      name: den.name ?? "",
      address: den.address ?? "",
      city: den.city ?? "",
      phone: den.phone ?? "",
      email: den.email ?? "",
      rating: den.rating ?? 5,
      amenities: den.amenities ?? "",
      program_id: den.program_id ?? "",
    })
    setDialogOpen(true)
  }

  const visibleDens = dens
    .filter(den => den.type === "den")
    .filter(den => selectedProgram === "all" || den.program_id === selectedProgram)

  const postedTo = (denId: string) => assignments.filter(assignment => assignment.nest_id === denId)
  const assignable = assignTo
    ? members.filter(member => !postedTo(assignTo.id).some(assignment => assignment.user_id === member.id))
    : []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-5 w-5" aria-hidden="true" />
              Den locations
            </CardTitle>
            <CardDescription>Private lounges and the officers posted to each one.</CardDescription>
          </div>
          {canManage && visibleDens.length > 0 && (
            <Button size="sm" className="shrink-0" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true) }}>
              <Plus aria-hidden="true" />
              Add Den
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {visibleDens.length === 0 ? (
            <EmptyState
              icon={Home}
              title={selectedProgram === "all" ? "No Den locations yet" : "No Den locations for this programme"}
              description={canManage ? "Add the lounge where guests will be hosted, then post officers to it." : undefined}
              action={canManage ? (
                <Button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true) }}>
                  <Plus aria-hidden="true" />
                  Add Den
                </Button>
              ) : undefined}
            />
          ) : (
            <motion.div layout className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {visibleDens.map(den => {
                  const posted = postedTo(den.id)
                  const programName = programs.find(program => program.id === den.program_id)?.name
                  return (
                    <motion.div
                      layout
                      key={den.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className="flex h-full flex-col overflow-hidden">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="truncate text-lg">{den.name}</CardTitle>
                              {programName && <Badge variant="outline" className="mt-1">{programName}</Badge>}
                            </div>
                            {canManage && (
                              <div className="flex shrink-0 gap-1">
                                <Button aria-label={`Assign an officer to ${den.name}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setAssignTo(den); setOfficerId("") }}>
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button aria-label={`Edit ${den.name}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(den)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  aria-label={`Delete ${den.name}`}
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={async () => {
                                    if (await confirm({ message: `Delete ${den.name}?`, variant: "destructive" })) deleteDen.mutate(den.id)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <CardDescription>{den.city}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                          <p className="text-muted-foreground">{den.address}</p>
                          {den.phone && (
                            <a href={`tel:${den.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              {den.phone}
                            </a>
                          )}
                          <div className="mt-auto border-t pt-3">
                            <p className="mb-2 flex items-center gap-2 text-xs font-medium">
                              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              Posted officers ({posted.length})
                            </p>
                            {posted.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No officers posted yet.</p>
                            ) : (
                              <ul className="space-y-2">
                                {posted.map(assignment => {
                                  const member = memberById.get(assignment.user_id)
                                  return (
                                    <li key={assignment.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2">
                                      <button
                                        type="button"
                                        disabled={!member}
                                        onClick={() => member && onOpenProfile(member)}
                                        className="group flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                                      >
                                        <Avatar className="h-6 w-6 shrink-0">
                                          {member?.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                                          <AvatarFallback className="text-[10px]">{initialsOf(member?.full_name)}</AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0">
                                          <span className="block truncate text-xs font-medium group-enabled:group-hover:underline">
                                            {member?.full_name ?? "Former Den officer"}
                                          </span>
                                          <span className="block text-xs text-muted-foreground">
                                            {assignment.is_active ? "On duty" : "Off duty"}
                                          </span>
                                        </span>
                                      </button>
                                      {canManage && (
                                        <div className="flex shrink-0 items-center gap-1">
                                          <Switch
                                            aria-label={`${member?.full_name ?? "Officer"} on duty`}
                                            checked={assignment.is_active}
                                            onCheckedChange={() => toggleAssignment.mutate(assignment)}
                                            className="scale-75"
                                          />
                                          <Button
                                            aria-label={`Remove ${member?.full_name ?? "officer"} from ${den.name}`}
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={async () => {
                                              if (await confirm({ message: "Remove this officer from the location?", variant: "destructive" })) {
                                                removeAssignment.mutate(assignment.id)
                                              }
                                            }}
                                          >
                                            <Trash2 className="h-3 w-3 text-destructive" />
                                          </Button>
                                        </div>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Den location" : "Add Den location"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this lounge's details." : "Add a private Den or lounge where guests are hosted."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!canManage) {
                toast.error("You are not authorised to manage Den locations")
                return
              }
              if (!saveDen.isPending) saveDen.mutate()
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-name">Name *</Label>
                <Input id="den-name" required placeholder="e.g., Main Church Den" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-program">Programme</Label>
                <Select value={form.program_id || "unassigned"} onValueChange={value => setForm({ ...form, program_id: value === "unassigned" ? "" : value })}>
                  <SelectTrigger id="den-program"><SelectValue placeholder="Select a programme (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">No programme</SelectItem>
                    {programs.map(program => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="den-address">Address *</Label>
                <Input id="den-address" required placeholder="e.g., 1 Aguiyi Ironsi Street" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-city">City *</Label>
                <Input id="den-city" required placeholder="e.g., Abuja" value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="den-phone">Phone</Label>
                <Input id="den-phone" type="tel" placeholder="+234 xxx xxx xxxx" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-email">Email</Label>
                <Input id="den-email" type="email" placeholder="info@den.com" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="den-rating">Rating (1 to 5)</Label>
                <Input id="den-rating" type="number" min="1" max="5" value={form.rating} onChange={event => setForm({ ...form, rating: parseInt(event.target.value, 10) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="den-amenities">Amenities (comma separated)</Label>
              <Textarea id="den-amenities" placeholder="e.g., Sound system, Seating, Refreshments..." value={form.amenities} onChange={event => setForm({ ...form, amenities: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" pending={saveDen.isPending}>{editing ? "Update Den" : "Add Den"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignTo)} onOpenChange={open => { if (!open) setAssignTo(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign an officer to {assignTo?.name}</DialogTitle>
            <DialogDescription>Any officer serving in November (Den) can be posted here.</DialogDescription>
          </DialogHeader>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!officerId) {
                toast.error("Please select an officer")
                return
              }
              if (!assignOfficer.isPending) assignOfficer.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="den-assign-officer">Officer</Label>
              <Select value={officerId} onValueChange={setOfficerId}>
                <SelectTrigger id="den-assign-officer"><SelectValue placeholder="Choose an officer" /></SelectTrigger>
                <SelectContent>
                  {assignable.length === 0 && (
                    <p className="px-2 py-3 text-sm text-muted-foreground">Every Den officer is already posted here.</p>
                  )}
                  {assignable.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name ?? member.email}
                      <span className="ml-2 text-xs text-muted-foreground">{DEN_ACCESS_LABEL[member.level]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAssignTo(null)}>Cancel</Button>
              <Button type="submit" pending={assignOfficer.isPending} disabled={!officerId}>
                {!assignOfficer.isPending && <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
                Assign officer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
