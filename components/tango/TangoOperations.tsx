"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowRight,
  Building2,
  Car,
  CheckCircle2,
  Clock3,
  Edit3,
  Loader2,
  MessageSquareText,
  Plane,
  Plus,
  Radio,
  RefreshCw,
  Route,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { toast } from "sonner"

type TangoOperationsProps = {
  cheetahs: any[]
  programs: any[]
  legacyCanManage?: boolean
}

type PartnerForm = {
  name: string
  partner_type: "internal" | "external"
  contact_name: string
  phone: string
  email: string
  notes: string
}

const emptyPartner: PartnerForm = {
  name: "",
  partner_type: "internal",
  contact_name: "",
  phone: "",
  email: "",
  notes: "",
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "Time pending"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

const journeyLabel = (journey: any) =>
  journey?.name || [journey?.origin, journey?.destination].filter(Boolean).join(" → ") || "Unnamed journey"

const statusVariant = (status?: string | null): "success" | "warning" | "secondary" | "destructive" | "outline" => {
  if (["active", "in_progress", "arrived", "completed", "submitted"].includes(status || "")) return "success"
  if (["delayed", "attention", "pending", "planned"].includes(status || "")) return "warning"
  if (["cancelled", "failed", "rejected"].includes(status || "")) return "destructive"
  return "secondary"
}

function QueryNotice({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">The rest of Tango remains available while this data reconnects.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  )
}

export default function TangoOperations({ cheetahs, programs, legacyCanManage = false }: TangoOperationsProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const [partnerForm, setPartnerForm] = useState<PartnerForm>(emptyPartner)
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null)
  const [allocationForm, setAllocationForm] = useState({
    journey_id: "",
    cheetah_id: "",
    assignment_role: "support",
    driver_name: "",
    driver_phone: "",
  })
  const [feedbackForm, setFeedbackForm] = useState({
    journey_id: "",
    cheetah_id: "",
    rating: 5,
    safety_rating: 5,
    punctuality_rating: 5,
    cleanliness_rating: 5,
    notes: "",
  })

  const accessQuery = useQuery({
    queryKey: ["unit-access", "tango"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { userId: null, isMember: false, canManage: false }
      const [memberResult, managerResult] = await Promise.all([
        (supabase as any).rpc("is_unit_member", { unit_slug: "tango" }),
        (supabase as any).rpc("can_manage_unit", { unit_slug: "tango" }),
      ])
      return {
        userId: user.id,
        isMember: memberResult.error ? legacyCanManage : Boolean(memberResult.data),
        canManage: managerResult.error ? legacyCanManage : Boolean(managerResult.data),
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const partnersQuery = useQuery({
    queryKey: ["fleet-partners"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fleet_partners").select("*").order("name")
      if (error) throw error
      return data || []
    },
  })

  const journeysQuery = useQuery({
    queryKey: ["tango-journeys-board"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("journeys")
        .select("id,name,origin,destination,status,current_status,current_call_sign,program_id,papa_id,assigned_cheetah_id,assigned_do_id,assigned_duty_officer_id,scheduled_departure,scheduled_arrival,etd,eta,is_deleted")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .or("status.is.null,status.not.in.(completed,cancelled)")
        .order("scheduled_departure", { ascending: false, nullsFirst: false })
        .limit(250)
      if (error) throw error
      return data || []
    },
  })

  const allocationsQuery = useQuery({
    queryKey: ["journey-cheetahs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("journey_cheetahs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250)
      if (error) throw error
      return data || []
    },
  })

  const dutyOfficersQuery = useQuery({
    queryKey: ["tango-duty-officers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("journey_duty_officers")
        .select("journey_id,user_id,is_lead,status")
        .limit(500)
      if (error) throw error
      return data || []
    },
  })

  const peopleQuery = useQuery({
    queryKey: ["tango-people-lite"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("users")
        .select("id,full_name")
        .eq("is_active", true)
        .order("full_name")
        .limit(500)
      if (error) throw error
      return data || []
    },
  })

  const feedbackQuery = useQuery({
    queryKey: ["driver-feedback"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("driver_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80)
      if (error) throw error
      return data || []
    },
  })

  const flightsQuery = useQuery({
    queryKey: ["tango-papa-itineraries"],
    queryFn: async () => {
      const { data: papas, error } = await (supabase as any)
        .from("papas")
        .select("id,program_id,title,full_name,airline,flight_provider,flight_number,arrival_date,departure_date,flight_arrival_time,flight_departure_time,arrival_city,arrival_country")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("arrival_date", { ascending: true, nullsFirst: false })
        .limit(150)
      if (error) throw error

      const optional = async (table: string) => {
        const result = await (supabase as any).from(table).select("*").limit(400)
        return result.error ? [] : result.data || []
      }
      const [itineraries, normalizedLegs, directLegs] = await Promise.all([
        optional("flight_itineraries"),
        optional("flight_legs"),
        optional("papa_flight_legs"),
      ])
      return { papas: papas || [], itineraries, legs: directLegs.length ? directLegs : normalizedLegs }
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel("tango-driver-feedback-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_feedback" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["driver-feedback"] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [queryClient, supabase])

  const userId = accessQuery.data?.userId || null
  const canManage = accessQuery.data?.canManage ?? legacyCanManage
  const journeys = journeysQuery.data || []
  const allocations = allocationsQuery.data || []
  const dutyOfficers = dutyOfficersQuery.data || []
  const people = peopleQuery.data || []
  const peopleById = useMemo(() => new Map<string, any>(people.map((person: any) => [person.id, person] as [string, any])), [people])
  const cheetahById = useMemo(() => new Map<string, any>(cheetahs.map((cheetah: any) => [cheetah.id, cheetah] as [string, any])), [cheetahs])
  const journeyById = useMemo(() => new Map<string, any>(journeys.map((journey: any) => [journey.id, journey] as [string, any])), [journeys])
  const activeJourneys = journeys.filter((journey: any) => !["completed", "cancelled"].includes(journey.status || journey.current_status))

  const myJourneyIds = useMemo(() => {
    if (!userId) return new Set<string>()
    const ids = new Set<string>()
    const rejectedIds = new Set<string>()
    dutyOfficers.forEach((assignment: any) => {
      if (assignment.user_id === userId && assignment.status === "rejected") rejectedIds.add(assignment.journey_id)
      if (assignment.user_id === userId && !["removed", "rejected"].includes(assignment.status)) ids.add(assignment.journey_id)
    })
    journeys.forEach((journey: any) => {
      if (!rejectedIds.has(journey.id) && (journey.assigned_do_id === userId || journey.assigned_duty_officer_id === userId)) ids.add(journey.id)
    })
    return ids
  }, [dutyOfficers, journeys, userId])

  const myJourneys = activeJourneys.filter((journey: any) => myJourneyIds.has(journey.id))
  const feedbackJourneyOptions = myJourneys

  const savePartner = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before saving a partner")
      const payload = {
        ...partnerForm,
        name: partnerForm.name.trim(),
        contact_name: partnerForm.contact_name.trim() || null,
        phone: partnerForm.phone.trim() || null,
        email: partnerForm.email.trim() || null,
        notes: partnerForm.notes.trim() || null,
        is_active: true,
      }
      if (!payload.name) throw new Error("Partner name is required")
      const query = (supabase as any).from("fleet_partners")
      const { error } = editingPartnerId
        ? await query.update(payload).eq("id", editingPartnerId)
        : await query.insert({ ...payload, created_by: userId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(editingPartnerId ? "Partner updated" : "Partner added")
      setEditingPartnerId(null)
      setPartnerForm(emptyPartner)
      void queryClient.invalidateQueries({ queryKey: ["fleet-partners"] })
    },
    onError: (error: any) => toast.error(error.message || "Partner could not be saved"),
  })

  const deletePartner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("fleet_partners").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Partner removed")
      void queryClient.invalidateQueries({ queryKey: ["fleet-partners"] })
    },
    onError: (error: any) => toast.error(error.message || "Partner could not be removed"),
  })

  const linkVehicle = useMutation({
    mutationFn: async ({ cheetahId, partnerId, ownershipType }: { cheetahId: string; partnerId: string | null; ownershipType: string }) => {
      const { error } = await (supabase as any)
        .from("cheetahs")
        .update({ partner_id: partnerId, ownership_type: ownershipType })
        .eq("id", cheetahId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Fleet ownership updated")
      void queryClient.invalidateQueries({ queryKey: ["cheetahs"] })
    },
    onError: (error: any) => toast.error(error.message || "Vehicle ownership could not be updated"),
  })

  const addAllocation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before assigning a vehicle")
      if (!allocationForm.journey_id || !allocationForm.cheetah_id) throw new Error("Choose a journey and Cheetah")
      const { error } = await (supabase as any).from("journey_cheetahs").insert({
        journey_id: allocationForm.journey_id,
        cheetah_id: allocationForm.cheetah_id,
        assignment_role: allocationForm.assignment_role,
        driver_name: allocationForm.driver_name.trim() || null,
        driver_phone: allocationForm.driver_phone.trim() || null,
        status: "assigned",
        assigned_by: userId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Cheetah assigned to journey")
      setAllocationForm({ journey_id: "", cheetah_id: "", assignment_role: "support", driver_name: "", driver_phone: "" })
      void queryClient.invalidateQueries({ queryKey: ["journey-cheetahs"] })
      void queryClient.invalidateQueries({ queryKey: ["tango-journeys-board"] })
    },
    onError: (error: any) => toast.error(error.message || "Cheetah could not be assigned"),
  })

  const removeAllocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("journey_cheetahs").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Vehicle allocation removed")
      void queryClient.invalidateQueries({ queryKey: ["journey-cheetahs"] })
      void queryClient.invalidateQueries({ queryKey: ["tango-journeys-board"] })
    },
    onError: (error: any) => toast.error(error.message || "Allocation could not be removed"),
  })

  const submitFeedback = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before sending feedback")
      if (!feedbackForm.journey_id || !feedbackForm.cheetah_id) throw new Error("Choose the journey and Cheetah")
      if (!myJourneyIds.has(feedbackForm.journey_id)) throw new Error("Only an assigned Duty Officer can review this journey")
      const journey = journeyById.get(feedbackForm.journey_id)
      const { error } = await (supabase as any).from("driver_feedback").insert({
        ...feedbackForm,
        papa_id: journey?.papa_id || null,
        reviewer_id: userId,
        notes: feedbackForm.notes.trim() || null,
        status: "submitted",
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Driver feedback sent")
      setFeedbackForm({ journey_id: "", cheetah_id: "", rating: 5, safety_rating: 5, punctuality_rating: 5, cleanliness_rating: 5, notes: "" })
      void queryClient.invalidateQueries({ queryKey: ["driver-feedback"] })
    },
    onError: (error: any) => toast.error(error.message || "Feedback could not be sent"),
  })

  const handlePartnerSubmit = (event: FormEvent) => {
    event.preventDefault()
    savePartner.mutate()
  }

  const handleAllocationSubmit = (event: FormEvent) => {
    event.preventDefault()
    addAllocation.mutate()
  }

  const handleFeedbackSubmit = (event: FormEvent) => {
    event.preventDefault()
    submitFeedback.mutate()
  }

  const allocationsForJourney = (journey: any) => {
    const rows = allocations.filter((allocation: any) => allocation.journey_id === journey.id)
    if (!rows.length && journey.assigned_cheetah_id) {
      return [{ id: `legacy-${journey.id}`, cheetah_id: journey.assigned_cheetah_id, assignment_role: "primary", status: "assigned", legacy: true }]
    }
    return rows
  }

  const dutyNamesForJourney = (journey: any) => {
    const names = dutyOfficers
      .filter((assignment: any) => assignment.journey_id === journey.id && !["removed", "rejected"].includes(assignment.status))
      .sort((a: any, b: any) => Number(b.is_lead) - Number(a.is_lead))
      .map((assignment: any) => peopleById.get(assignment.user_id)?.full_name)
      .filter(Boolean)
    if (!names.length) {
      const fallbackId = journey.assigned_do_id || journey.assigned_duty_officer_id
      const fallback = fallbackId ? peopleById.get(fallbackId)?.full_name : null
      if (fallback) names.push(fallback)
    }
    return names
  }

  const flightRows = useMemo(() => {
    const context = flightsQuery.data
    if (!context) return []
    const itineraryById = new Map<string, any>((context.itineraries || []).map((itinerary: any) => [itinerary.id, itinerary] as [string, any]))
    return (context.papas || []).map((papa: any) => {
      const legs = (context.legs || [])
        .filter((leg: any) => {
          const itinerary: any = itineraryById.get(leg.itinerary_id)
          return leg.papa_id === papa.id || itinerary?.papa_id === papa.id
        })
        .sort((a: any, b: any) => Number(a.leg_order || a.sequence || 0) - Number(b.leg_order || b.sequence || 0))
      if (!legs.length && papa.flight_number) {
        legs.push({
          id: `legacy-${papa.id}`,
          flight_number: papa.flight_number,
          airline: papa.airline || papa.flight_provider,
          origin: null,
          destination: [papa.arrival_city, papa.arrival_country].filter(Boolean).join(", "),
          scheduled_departure: papa.flight_departure_time || papa.departure_date,
          scheduled_arrival: papa.flight_arrival_time || papa.arrival_date,
          status: "scheduled",
        })
      }
      return { papa, legs }
    }).filter((row: any) => row.legs.length)
  }, [flightsQuery.data])

  const isLoading = journeysQuery.isLoading || accessQuery.isLoading

  return (
    <section className="space-y-4" aria-labelledby="tango-operations-title">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700 dark:text-emerald-400">LIVE TRANSPORT DESK</p>
          </div>
          <h2 id="tango-operations-title" className="mt-2 text-xl font-semibold tracking-tight">Journeys, drivers and partner fleet</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Allocate more than one Cheetah, monitor operational call signs, review driver service and read Papa flight movements.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
          {canManage ? "Unit-head controls enabled" : "Operational view"}
        </div>
      </div>

      <Tabs defaultValue="board" className="w-full">
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          <TabsTrigger value="board" className="gap-2"><Route className="h-3.5 w-3.5" />Call-sign board</TabsTrigger>
          <TabsTrigger value="allocations" className="gap-2"><Car className="h-3.5 w-3.5" />Allocations</TabsTrigger>
          <TabsTrigger value="partners" className="gap-2"><Building2 className="h-3.5 w-3.5" />Partners</TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2"><MessageSquareText className="h-3.5 w-3.5" />Driver feedback</TabsTrigger>
          <TabsTrigger value="flights" className="gap-2"><Plane className="h-3.5 w-3.5" />Papa flights</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="space-y-3">
          {journeysQuery.isError ? (
            <QueryNotice title="The journey board could not be loaded" onRetry={() => void journeysQuery.refetch()} />
          ) : isLoading ? (
            <div className="flex justify-center rounded-xl border py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : activeJourneys.length === 0 ? (
            <div className="rounded-xl border border-dashed py-14 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/60" />
              <p className="mt-3 text-sm font-medium">No active transport movements</p>
              <p className="mt-1 text-xs text-muted-foreground">Planned journeys will appear here with their DOs and Cheetahs.</p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {activeJourneys.map((journey: any) => {
                const journeyAllocations = allocationsForJourney(journey)
                const dutyNames = dutyNamesForJourney(journey)
                const program = programs.find((item: any) => item.id === journey.program_id)
                return (
                  <article key={journey.id} className="rounded-xl border bg-card p-4 transition-colors hover:border-emerald-500/35">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant(journey.status || journey.current_status)}>{journey.status || journey.current_status || "planned"}</Badge>
                          {journey.current_call_sign && <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">{journey.current_call_sign}</span>}
                        </div>
                        <h3 className="mt-2 truncate font-semibold">{journeyLabel(journey)}</h3>
                        {program?.name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{program.name}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-semibold tabular-nums">{journeyAllocations.length}</p>
                        <p className="text-[10px] text-muted-foreground">Cheetah{journeyAllocations.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {journeyAllocations.map((allocation: any) => {
                        const vehicle = cheetahById.get(allocation.cheetah_id)
                        return (
                          <span key={allocation.id} className="inline-flex items-center gap-2 rounded-md bg-emerald-500/8 px-2.5 py-1.5 text-xs">
                            <Car className="h-3.5 w-3.5 text-emerald-600" />
                            <strong>{vehicle?.call_sign || vehicle?.registration_number || "Vehicle"}</strong>
                            <span className="text-muted-foreground">{allocation.assignment_role || "support"}</span>
                          </span>
                        )
                      })}
                    </div>
                    <div className="mt-4 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2">
                      <span className="flex items-center gap-2"><UsersRound className="h-3.5 w-3.5" />{dutyNames.length ? dutyNames.join(", ") : "DO not assigned"}</span>
                      <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(journey.etd || journey.scheduled_departure)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4">
          {allocationsQuery.isError && <QueryNotice title="Multi-vehicle allocations are not available yet" onRetry={() => void allocationsQuery.refetch()} />}
          {canManage && (
            <form onSubmit={handleAllocationSubmit} className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[1.35fr_1fr_.7fr_1fr_1fr_auto] lg:items-end">
              <div className="space-y-2">
                <Label>Journey</Label>
                <Select value={allocationForm.journey_id || "none"} onValueChange={(value) => setAllocationForm((current) => ({ ...current, journey_id: value === "none" ? "" : value }))}>
                  <SelectTrigger><SelectValue placeholder="Choose journey" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Choose journey</SelectItem>{activeJourneys.map((journey: any) => <SelectItem key={journey.id} value={journey.id}>{journeyLabel(journey)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cheetah</Label>
                <Select value={allocationForm.cheetah_id || "none"} onValueChange={(value) => setAllocationForm((current) => ({ ...current, cheetah_id: value === "none" ? "" : value }))}>
                  <SelectTrigger><SelectValue placeholder="Choose Cheetah" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Choose Cheetah</SelectItem>{cheetahs.map((cheetah: any) => <SelectItem key={cheetah.id} value={cheetah.id}>{cheetah.call_sign || cheetah.registration_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={allocationForm.assignment_role} onValueChange={(value) => setAllocationForm((current) => ({ ...current, assignment_role: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="support">Support</SelectItem><SelectItem value="luggage">Luggage</SelectItem><SelectItem value="security">Security</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="allocation-driver">Driver</Label><Input id="allocation-driver" value={allocationForm.driver_name} onChange={(event) => setAllocationForm((current) => ({ ...current, driver_name: event.target.value }))} placeholder="Driver name" /></div>
              <div className="space-y-2"><Label htmlFor="allocation-phone">Phone</Label><Input id="allocation-phone" type="tel" value={allocationForm.driver_phone} onChange={(event) => setAllocationForm((current) => ({ ...current, driver_phone: event.target.value }))} placeholder="+234…" /></div>
              <Button type="submit" disabled={addAllocation.isPending} className="gap-2">{addAllocation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Assign</Button>
            </form>
          )}
          <div className="space-y-3">
            {allocations.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No additional Cheetahs have been allocated.</p> : allocations.map((allocation: any) => {
              const journey = journeyById.get(allocation.journey_id)
              const vehicle = cheetahById.get(allocation.cheetah_id)
              return (
                <div key={allocation.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><Car className="h-5 w-5" /></div>
                    <div className="min-w-0"><p className="truncate font-medium">{vehicle?.call_sign || vehicle?.registration_number || "Unknown Cheetah"} · {allocation.assignment_role}</p><p className="truncate text-xs text-muted-foreground">{journeyLabel(journey)}{allocation.driver_name ? ` · ${allocation.driver_name}` : ""}</p></div>
                  </div>
                  <div className="flex items-center gap-2"><Badge variant={statusVariant(allocation.status)}>{allocation.status || "assigned"}</Badge>{canManage && <Button type="button" variant="ghost" size="icon" aria-label="Remove allocation" onClick={async () => { if (await confirm({ message: "Remove this Cheetah from the journey?", variant: "destructive" })) removeAllocation.mutate(allocation.id) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="partners" className="space-y-4">
          {partnersQuery.isError && <QueryNotice title="Fleet partner records are not available yet" onRetry={() => void partnersQuery.refetch()} />}
          <div className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
            {canManage && (
              <form onSubmit={handlePartnerSubmit} className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <div><h3 className="font-semibold">{editingPartnerId ? "Edit fleet partner" : "Add fleet partner"}</h3><p className="mt-1 text-xs text-muted-foreground">Record internal teams and external vehicle suppliers.</p></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="partner-name">Partner name</Label><Input id="partner-name" required value={partnerForm.name} onChange={(event) => setPartnerForm((current) => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label>Partner type</Label><Select value={partnerForm.partner_type} onValueChange={(value: "internal" | "external") => setPartnerForm((current) => ({ ...current, partner_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="internal">Internal</SelectItem><SelectItem value="external">External</SelectItem></SelectContent></Select></div></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="partner-contact">Contact person</Label><Input id="partner-contact" value={partnerForm.contact_name} onChange={(event) => setPartnerForm((current) => ({ ...current, contact_name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="partner-phone">Phone</Label><Input id="partner-phone" type="tel" value={partnerForm.phone} onChange={(event) => setPartnerForm((current) => ({ ...current, phone: event.target.value }))} /></div></div>
                <div className="space-y-2"><Label htmlFor="partner-email">Email</Label><Input id="partner-email" type="email" value={partnerForm.email} onChange={(event) => setPartnerForm((current) => ({ ...current, email: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="partner-notes">Notes</Label><Textarea id="partner-notes" value={partnerForm.notes} onChange={(event) => setPartnerForm((current) => ({ ...current, notes: event.target.value }))} /></div>
                <div className="flex justify-end gap-2">{editingPartnerId && <Button type="button" variant="outline" onClick={() => { setEditingPartnerId(null); setPartnerForm(emptyPartner) }}>Cancel</Button>}<Button type="submit" disabled={savePartner.isPending}>{savePartner.isPending ? "Saving…" : editingPartnerId ? "Save changes" : "Add partner"}</Button></div>
              </form>
            )}
            <div className="space-y-3">
              {(partnersQuery.data || []).length === 0 ? <div className="rounded-xl border border-dashed py-12 text-center"><Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No fleet partners recorded</p></div> : (partnersQuery.data || []).map((partner: any) => (
                <article key={partner.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{partner.name}</h3><Badge variant="outline">{partner.partner_type}</Badge>{partner.is_active === false && <Badge variant="secondary">Inactive</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{[partner.contact_name, partner.phone, partner.email].filter(Boolean).join(" · ") || "Contact details pending"}</p></div>{canManage && <div className="flex gap-1"><Button type="button" variant="ghost" size="icon" aria-label="Edit partner" onClick={() => { setEditingPartnerId(partner.id); setPartnerForm({ name: partner.name || "", partner_type: partner.partner_type || "internal", contact_name: partner.contact_name || "", phone: partner.phone || "", email: partner.email || "", notes: partner.notes || "" }) }}><Edit3 className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Delete partner" onClick={async () => { if (await confirm({ message: "Delete this fleet partner? Linked vehicles must be reassigned first.", variant: "destructive" })) deletePartner.mutate(partner.id) }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>}</div>
                  {partner.notes && <p className="mt-3 text-sm text-muted-foreground">{partner.notes}</p>}
                </article>
              ))}
            </div>
          </div>
          {canManage && cheetahs.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Fleet ownership</CardTitle><CardDescription>Connect every Cheetah to its internal owner or external supplier.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-2">
                {cheetahs.map((cheetah: any) => (
                  <div key={cheetah.id} className="grid gap-3 rounded-lg bg-muted/35 p-3 sm:grid-cols-[1fr_.7fr_1fr] sm:items-center">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{cheetah.call_sign || cheetah.registration_number}</p><p className="truncate text-xs text-muted-foreground">{cheetah.make} {cheetah.model}</p></div>
                    <Select defaultValue={cheetah.ownership_type || "internal"} onValueChange={(value) => linkVehicle.mutate({ cheetahId: cheetah.id, partnerId: cheetah.partner_id || null, ownershipType: value })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="internal">Internal</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent></Select>
                    <Select defaultValue={cheetah.partner_id || "none"} onValueChange={(value) => linkVehicle.mutate({ cheetahId: cheetah.id, partnerId: value === "none" ? null : value, ownershipType: value === "none" ? "internal" : "partner" })}><SelectTrigger className="h-9"><SelectValue placeholder="Partner" /></SelectTrigger><SelectContent><SelectItem value="none">No partner</SelectItem>{(partnersQuery.data || []).filter((partner: any) => partner.is_active !== false).map((partner: any) => <SelectItem key={partner.id} value={partner.id}>{partner.name}</SelectItem>)}</SelectContent></Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          {feedbackQuery.isError && <QueryNotice title="Driver feedback is not available yet" onRetry={() => void feedbackQuery.refetch()} />}
          <div className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
            {feedbackJourneyOptions.length > 0 ? (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <div><h3 className="font-semibold">Record driver feedback</h3><p className="mt-1 text-xs text-muted-foreground">Assigned DOs can send observations while an operation is underway.</p></div>
                <div className="space-y-2"><Label>Journey</Label><Select value={feedbackForm.journey_id || "none"} onValueChange={(value) => setFeedbackForm((current) => ({ ...current, journey_id: value === "none" ? "" : value, cheetah_id: "" }))}><SelectTrigger><SelectValue placeholder="Choose assigned journey" /></SelectTrigger><SelectContent><SelectItem value="none">Choose journey</SelectItem>{feedbackJourneyOptions.map((journey: any) => <SelectItem key={journey.id} value={journey.id}>{journeyLabel(journey)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Cheetah / driver</Label><Select value={feedbackForm.cheetah_id || "none"} onValueChange={(value) => setFeedbackForm((current) => ({ ...current, cheetah_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Choose Cheetah" /></SelectTrigger><SelectContent><SelectItem value="none">Choose Cheetah</SelectItem>{(feedbackForm.journey_id ? allocationsForJourney(journeyById.get(feedbackForm.journey_id)) : []).map((allocation: any) => { const vehicle = cheetahById.get(allocation.cheetah_id); return <SelectItem key={allocation.cheetah_id} value={allocation.cheetah_id}>{vehicle?.call_sign || vehicle?.registration_number || "Cheetah"}{allocation.driver_name ? ` · ${allocation.driver_name}` : ""}</SelectItem> })}</SelectContent></Select></div>
                <div className="grid grid-cols-2 gap-3">{(["rating", "safety_rating", "punctuality_rating", "cleanliness_rating"] as const).map((field) => <div key={field} className="space-y-2"><Label htmlFor={`feedback-${field}`}>{field === "rating" ? "Overall" : field.replace("_rating", "").replace(/^./, (letter) => letter.toUpperCase())}</Label><Input id={`feedback-${field}`} type="number" min={1} max={5} value={feedbackForm[field]} onChange={(event) => setFeedbackForm((current) => ({ ...current, [field]: Math.min(5, Math.max(1, Number(event.target.value))) }))} /></div>)}</div>
                <div className="space-y-2"><Label htmlFor="feedback-notes">What should Tango know?</Label><Textarea id="feedback-notes" required value={feedbackForm.notes} onChange={(event) => setFeedbackForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Describe the driver's conduct, vehicle condition or action needed." /></div>
                <Button type="submit" disabled={submitFeedback.isPending} className="w-full">{submitFeedback.isPending ? "Sending…" : "Send feedback"}</Button>
              </form>
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center"><UserRound className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No assigned journey to review</p><p className="mt-1 text-xs text-muted-foreground">The feedback form opens for the assigned DO.</p></div>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="font-semibold">Live feedback feed</h3><p className="text-xs text-muted-foreground">Newest observations appear first.</p></div><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live</span></div>
              {(feedbackQuery.data || []).length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No driver feedback submitted.</p> : (feedbackQuery.data || []).map((feedback: any) => { const journey = journeyById.get(feedback.journey_id); const vehicle = cheetahById.get(feedback.cheetah_id); const reviewer = peopleById.get(feedback.reviewer_id); return (
                <article key={feedback.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{vehicle?.call_sign || vehicle?.registration_number || "Driver review"}</p><p className="truncate text-xs text-muted-foreground">{journeyLabel(journey)} · {reviewer?.full_name || "Duty Officer"}</p></div><div className="text-right"><p className="text-lg font-semibold tabular-nums">{feedback.rating}/5</p><p className="text-[10px] text-muted-foreground">overall</p></div></div>
                  {feedback.notes && <p className="mt-3 text-sm leading-relaxed">{feedback.notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>Safety {feedback.safety_rating}/5</span><span>·</span><span>Punctuality {feedback.punctuality_rating}/5</span><span>·</span><span>Cleanliness {feedback.cleanliness_rating}/5</span><span className="ml-auto">{formatDateTime(feedback.created_at)}</span></div>
                </article>
              )})}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="flights" className="space-y-3">
          {flightsQuery.isError ? <QueryNotice title="Papa itineraries could not be loaded" onRetry={() => void flightsQuery.refetch()} /> : flightsQuery.isLoading ? <div className="flex justify-center rounded-xl border py-14"><Loader2 className="h-5 w-5 animate-spin" /></div> : flightRows.length === 0 ? <div className="rounded-xl border border-dashed py-14 text-center"><Plane className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No flight itineraries recorded</p><p className="mt-1 text-xs text-muted-foreground">Flight legs from Papa forms will appear here.</p></div> : flightRows.map(({ papa, legs }: any) => (
            <article key={papa.id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-1 border-b pb-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs text-muted-foreground">Papa itinerary</p><h3 className="font-semibold">{[papa.title, papa.full_name].filter(Boolean).join(" ")}</h3></div><Badge variant="outline">{legs.length} leg{legs.length === 1 ? "" : "s"}</Badge></div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">{legs.map((leg: any, index: number) => (
                <div key={leg.id || index} className="rounded-lg bg-muted/35 p-3">
                  <div className="flex items-center justify-between gap-3"><p className="font-mono text-sm font-semibold">{leg.flight_number || leg.adsb_callsign || leg.callsign || "Flight pending"}</p><Badge variant={statusVariant(leg.status)}>{leg.status || "scheduled"}</Badge></div>
                  <div className="mt-3 flex items-center gap-2 text-sm"><span className="font-medium">{leg.origin || leg.departure_airport || "Origin pending"}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">{leg.destination || leg.arrival_airport || "Destination pending"}</span></div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{leg.airline || papa.airline || papa.flight_provider || "Airline pending"}</span><span>Departs {formatDateTime(leg.estimated_departure || leg.scheduled_departure || leg.departure_at)}</span><span>Arrives {formatDateTime(leg.estimated_arrival || leg.scheduled_arrival || leg.arrival_at)}</span></div>
                </div>
              ))}</div>
            </article>
          ))}
        </TabsContent>
      </Tabs>
    </section>
  )
}
