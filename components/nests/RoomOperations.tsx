"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Gift,
  ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  PackageCheck,
  Plane,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserRoundCheck,
  UsersRound,
  Utensils,
  Wrench,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type RoomOperationsProps = {
  nests: any[]
  selectedProgram: string
  legacyCanManage?: boolean
}

const fmtDate = (value?: string | null, includeTime = true) => {
  if (!value) return "Pending"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-NG", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }
  ).format(date)
}

const toIso = (value: string) => value ? new Date(value).toISOString() : null

const badgeForStatus = (status?: string | null): "success" | "warning" | "destructive" | "secondary" | "outline" => {
  if (["ready", "passed", "resolved", "checked_in", "delivered"].includes(status || "")) return "success"
  if (["preparing", "assigned", "planned", "attention", "in_progress"].includes(status || "")) return "warning"
  if (["out_of_service", "failed", "critical", "cancelled"].includes(status || "")) return "destructive"
  return "secondary"
}

function QueryNotice({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">Existing Nest tools remain available while this workspace reconnects.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2"><RefreshCw className="h-3.5 w-3.5" />Retry</Button>
    </div>
  )
}

export default function RoomOperations({ nests, selectedProgram, legacyCanManage = false }: RoomOperationsProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [roomForm, setRoomForm] = useState({ nest_id: "", room_number: "", name: "", room_type: "suite", floor: "", notes: "" })
  const [stayForm, setStayForm] = useState({ room_id: "", papa_id: "", program_id: "", planned_check_in: "", planned_check_out: "", special_requests: "", guest_names: "" })
  const [inspectionForm, setInspectionForm] = useState({ room_id: "", stay_id: "", assigned_to: "", due_at: "", notes: "" })
  const [itemForm, setItemForm] = useState({ room_id: "", stay_id: "", item_name: "", quantity: 1, category: "gift", notes: "" })
  const [itemPhoto, setItemPhoto] = useState<File | null>(null)
  const [issueForm, setIssueForm] = useState({ room_id: "", stay_id: "", title: "", description: "", severity: "medium", assigned_to: "", next_use_blocked: false })
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({})

  const accessQuery = useQuery({
    queryKey: ["unit-access", "november_nest"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { userId: null, isMember: false, canManage: false }
      const [memberResult, managerResult] = await Promise.all([
        (supabase as any).rpc("is_unit_member", { unit_slug: "november_nest" }),
        (supabase as any).rpc("can_manage_unit", { unit_slug: "november_nest" }),
      ])
      return {
        userId: user.id,
        isMember: memberResult.error ? legacyCanManage : Boolean(memberResult.data),
        canManage: managerResult.error ? legacyCanManage : Boolean(managerResult.data),
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const roomsQuery = useQuery({
    queryKey: ["nest-rooms"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("nest_rooms").select("*").order("room_number")
      if (error) throw error
      return data || []
    },
  })

  const staysQuery = useQuery({
    queryKey: ["nest-room-stays"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("nest_room_stays").select("*").order("planned_check_in", { ascending: true, nullsFirst: false }).limit(300)
      if (error) throw error
      return data || []
    },
  })

  const guestsQuery = useQuery({
    queryKey: ["nest-room-guests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("nest_room_guests").select("*").order("is_primary", { ascending: false }).limit(600)
      if (error) throw error
      return data || []
    },
  })

  const inspectionsQuery = useQuery({
    queryKey: ["nest-room-inspections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("nest_room_inspections").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(300)
      if (error) throw error
      return data || []
    },
  })

  const itemsQuery = useQuery({
    queryKey: ["nest-room-items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("nest_room_items").select("*").order("created_at", { ascending: false }).limit(400)
      if (error) throw error
      const rows = data || []
      return Promise.all(rows.map(async (item: any) => {
        if (!item.photo_path) return { ...item, photo_url: null }
        const signed = await supabase.storage.from("nest-room-media").createSignedUrl(item.photo_path, 60 * 60)
        return { ...item, photo_url: signed.error ? null : signed.data?.signedUrl || null }
      }))
    },
  })

  const issuesQuery = useQuery({
    queryKey: ["nest-room-issues"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("nest_room_issues").select("*").order("created_at", { ascending: false }).limit(400)
      if (error) throw error
      return data || []
    },
  })

  // Safety decisions must not depend on the paginated issue-history view. This
  // query remains small because it only returns unresolved room blocks.
  const blockingIssuesQuery = useQuery({
    queryKey: ["nest-room-blocking-issues"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("nest_room_issues")
        .select("id,room_id,status,next_use_blocked")
        .eq("next_use_blocked", true)
        .not("status", "in", "(resolved,verified,closed)")
      if (error) throw error
      return data || []
    },
  })

  const peopleQuery = useQuery({
    queryKey: ["nest-operations-people"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("users").select("id,full_name,role,oscar").eq("is_active", true).order("full_name").limit(500)
      if (error) throw error
      return data || []
    },
  })

  const papasQuery = useQuery({
    queryKey: ["nest-papa-arrivals", selectedProgram],
    queryFn: async () => {
      let query = (supabase as any)
        .from("papas")
        .select("id,program_id,title,full_name,arrival_date,departure_date,arrival_city,arrival_country,flight_number,airline,flight_provider,flight_arrival_time,flight_departure_time,dietary_restrictions,food_preferences,special_requirements,entourage_count,entourage_size,personal_assistants")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("arrival_date", { ascending: true, nullsFirst: false })
        .limit(180)
      if (selectedProgram !== "all") query = query.eq("program_id", selectedProgram)
      const { data, error } = await query
      if (error) throw error

      const optional = async (table: string) => {
        const result = await (supabase as any).from(table).select("*").limit(500)
        return result.error ? [] : result.data || []
      }
      const [itineraries, normalizedLegs, directLegs] = await Promise.all([
        optional("flight_itineraries"),
        optional("flight_legs"),
        optional("papa_flight_legs"),
      ])
      return { papas: data || [], itineraries, legs: directLegs.length ? directLegs : normalizedLegs }
    },
  })

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["nest-room-stays"] })
      void queryClient.invalidateQueries({ queryKey: ["nest-room-inspections"] })
      void queryClient.invalidateQueries({ queryKey: ["nest-room-items"] })
      void queryClient.invalidateQueries({ queryKey: ["nest-room-issues"] })
      void queryClient.invalidateQueries({ queryKey: ["nest-room-blocking-issues"] })
    }
    const channel = supabase
      .channel("nest-room-operations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "nest_room_stays" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "nest_room_inspections" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "nest_room_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "nest_room_issues" }, refresh)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [queryClient, supabase])

  const userId = accessQuery.data?.userId || null
  const canManage = accessQuery.data?.canManage ?? legacyCanManage
  const canContribute = Boolean(canManage || accessQuery.data?.isMember)
  const rooms = roomsQuery.data || []
  const stays = staysQuery.data || []
  const guests = guestsQuery.data || []
  const inspections = inspectionsQuery.data || []
  const items = itemsQuery.data || []
  const issues = issuesQuery.data || []
  const blockingIssues = blockingIssuesQuery.data || []
  const people = peopleQuery.data || []

  const visibleNests = selectedProgram === "all" ? nests : nests.filter((nest: any) => nest.program_id === selectedProgram)
  const visibleNestIds = useMemo(() => new Set(visibleNests.map((nest: any) => nest.id)), [visibleNests])
  const visibleRooms = rooms.filter((room: any) => visibleNestIds.has(room.nest_id))
  const visibleRoomIds = useMemo(() => new Set(visibleRooms.map((room: any) => room.id)), [visibleRooms])
  const visibleStays = stays.filter((stay: any) => visibleRoomIds.has(stay.room_id) && (selectedProgram === "all" || stay.program_id === selectedProgram))
  const visibleInspections = inspections.filter((inspection: any) => visibleRoomIds.has(inspection.room_id))
  const visibleItems = items.filter((item: any) => visibleRoomIds.has(item.room_id))
  const visibleIssues = issues.filter((issue: any) => visibleRoomIds.has(issue.room_id))
  const openIssues = visibleIssues.filter((issue: any) => issue.status !== "resolved")
  const blockedRoomIds = new Set(blockingIssues.map((issue: any) => issue.room_id))

  const nestById = useMemo(() => new Map<string, any>(nests.map((nest: any) => [nest.id, nest] as [string, any])), [nests])
  const roomById = useMemo(() => new Map<string, any>(rooms.map((room: any) => [room.id, room] as [string, any])), [rooms])
  const papaById = useMemo(() => new Map<string, any>((papasQuery.data?.papas || []).map((papa: any) => [papa.id, papa] as [string, any])), [papasQuery.data])
  const personById = useMemo(() => new Map<string, any>(people.map((person: any) => [person.id, person] as [string, any])), [people])

  const resetRoomForm = () => setRoomForm({ nest_id: "", room_number: "", name: "", room_type: "suite", floor: "", notes: "" })
  const resetStayForm = () => setStayForm({ room_id: "", papa_id: "", program_id: selectedProgram === "all" ? "" : selectedProgram, planned_check_in: "", planned_check_out: "", special_requests: "", guest_names: "" })
  const resetInspectionForm = () => setInspectionForm({ room_id: "", stay_id: "", assigned_to: "", due_at: "", notes: "" })
  const resetItemForm = () => { setItemForm({ room_id: "", stay_id: "", item_name: "", quantity: 1, category: "gift", notes: "" }); setItemPhoto(null) }
  const resetIssueForm = () => setIssueForm({ room_id: "", stay_id: "", title: "", description: "", severity: "medium", assigned_to: "", next_use_blocked: false })

  const createRoom = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before adding a room")
      if (!roomForm.nest_id || !roomForm.room_number.trim()) throw new Error("Choose a Nest and enter the room number")
      const { error } = await (supabase as any).from("nest_rooms").insert({
        nest_id: roomForm.nest_id,
        room_number: roomForm.room_number.trim(),
        name: roomForm.name.trim() || null,
        room_type: roomForm.room_type,
        floor: roomForm.floor.trim() || null,
        status: "preparing",
        notes: roomForm.notes.trim() || null,
        created_by: userId,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success("Room added to Nest"); resetRoomForm(); void queryClient.invalidateQueries({ queryKey: ["nest-rooms"] }) },
    onError: (error: any) => toast.error(error.message || "Room could not be added"),
  })

  const updateRoomStatus = useMutation({
    mutationFn: async ({ roomId, status }: { roomId: string; status: string }) => {
      const { error } = await (supabase as any).from("nest_rooms").update({ status }).eq("id", roomId)
      if (error) throw error
    },
    onSuccess: () => { toast.success("Room status updated"); void queryClient.invalidateQueries({ queryKey: ["nest-rooms"] }) },
    onError: (error: any) => toast.error(error.message || "Room status could not be updated"),
  })

  const createStay = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before assigning a room")
      if (!stayForm.room_id || !stayForm.papa_id || !stayForm.planned_check_in || !stayForm.planned_check_out) throw new Error("Room, Papa and planned dates are required")
      if (new Date(stayForm.planned_check_out) <= new Date(stayForm.planned_check_in)) throw new Error("Check-out must be after check-in")
      const room = roomById.get(stayForm.room_id)
      if (room?.status === "out_of_service" || blockedRoomIds.has(stayForm.room_id)) {
        throw new Error("Resolve the room's blocking issue before assigning another stay")
      }
      const programId = stayForm.program_id || nestById.get(room?.nest_id)?.program_id || papaById.get(stayForm.papa_id)?.program_id
      const { data: stay, error } = await (supabase as any).from("nest_room_stays").insert({
        room_id: stayForm.room_id,
        papa_id: stayForm.papa_id,
        program_id: programId || null,
        planned_check_in: toIso(stayForm.planned_check_in),
        planned_check_out: toIso(stayForm.planned_check_out),
        status: "planned",
        special_requests: stayForm.special_requests.trim() || null,
        assigned_by: userId,
      }).select("id").single()
      if (error) throw error

      const papa = papaById.get(stayForm.papa_id)
      const additionalGuests = stayForm.guest_names.split(/[\n,]/).map((name) => name.trim()).filter(Boolean)
      const guestRows = [
        { stay_id: stay.id, full_name: [papa?.title, papa?.full_name].filter(Boolean).join(" ") || "Papa", relationship: "primary guest", is_primary: true },
        ...additionalGuests.map((name) => ({ stay_id: stay.id, full_name: name, relationship: "entourage", is_primary: false })),
      ]
      const guestResult = await (supabase as any).from("nest_room_guests").insert(guestRows)
      if (guestResult.error) {
        await (supabase as any).from("nest_room_stays").delete().eq("id", stay.id)
        throw guestResult.error
      }
    },
    onSuccess: () => { toast.success("Room stay and guests assigned"); resetStayForm(); void queryClient.invalidateQueries({ queryKey: ["nest-room-stays"] }); void queryClient.invalidateQueries({ queryKey: ["nest-room-guests"] }) },
    onError: (error: any) => toast.error(error.message || "Room stay could not be created"),
  })

  const updateStayStatus = useMutation({
    mutationFn: async ({ stayId, status }: { stayId: string; status: "checked_in" | "checked_out" }) => {
      const update = status === "checked_in" ? { status, actual_check_in: new Date().toISOString() } : { status, actual_check_out: new Date().toISOString() }
      const { error } = await (supabase as any).from("nest_room_stays").update(update).eq("id", stayId)
      if (error) throw error
    },
    onSuccess: (_, variables) => { toast.success(variables.status === "checked_in" ? "Guest checked in" : "Guest checked out"); void queryClient.invalidateQueries({ queryKey: ["nest-room-stays"] }) },
    onError: (error: any) => toast.error(error.message || "Stay could not be updated"),
  })

  const createInspection = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before assigning an inspection")
      if (!inspectionForm.room_id || !inspectionForm.assigned_to || !inspectionForm.due_at) throw new Error("Room, inspector and due time are required")
      const { error } = await (supabase as any).from("nest_room_inspections").insert({
        room_id: inspectionForm.room_id,
        stay_id: inspectionForm.stay_id || null,
        assigned_to: inspectionForm.assigned_to,
        due_at: toIso(inspectionForm.due_at),
        status: "assigned",
        checklist: { linen: false, bathroom: false, climate: false, refreshments: false, gifts: false, security: false },
        notes: inspectionForm.notes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success("Room inspection assigned"); resetInspectionForm(); void queryClient.invalidateQueries({ queryKey: ["nest-room-inspections"] }) },
    onError: (error: any) => toast.error(error.message || "Inspection could not be assigned"),
  })

  const completeInspection = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "passed" | "attention" }) => {
      if (!userId) throw new Error("Sign in again before confirming the inspection")
      const checksPassed = status === "passed"
      const { error } = await (supabase as any).from("nest_room_inspections").update({
        inspected_by: userId,
        inspected_at: new Date().toISOString(),
        status,
        checklist: { linen: checksPassed, bathroom: checksPassed, climate: checksPassed, refreshments: checksPassed, gifts: checksPassed, security: checksPassed },
      }).eq("id", id)
      if (error) throw error
    },
    onSuccess: (_, variables) => { toast.success(variables.status === "passed" ? "Room inspection confirmed" : "Room flagged for attention"); void queryClient.invalidateQueries({ queryKey: ["nest-room-inspections"] }) },
    onError: (error: any) => toast.error(error.message || "Inspection could not be completed"),
  })

  const createItem = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before adding room contents")
      if (!itemForm.room_id || !itemForm.item_name.trim()) throw new Error("Room and item name are required")
      let photoPath: string | null = null
      if (itemPhoto) {
        const extension = itemPhoto.name.split(".").pop()?.toLowerCase() || "jpg"
        photoPath = `${itemForm.room_id}/${crypto.randomUUID()}.${extension.replace(/[^a-z0-9]/g, "")}`
        const upload = await supabase.storage.from("nest-room-media").upload(photoPath, itemPhoto, { contentType: itemPhoto.type || "image/jpeg", upsert: false })
        if (upload.error) throw upload.error
      }
      const { error } = await (supabase as any).from("nest_room_items").insert({
        room_id: itemForm.room_id,
        stay_id: itemForm.stay_id || null,
        item_name: itemForm.item_name.trim(),
        quantity: itemForm.quantity,
        category: itemForm.category,
        photo_path: photoPath,
        status: "placed",
        notes: itemForm.notes.trim() || null,
        created_by: userId,
      })
      if (error) {
        if (photoPath) await supabase.storage.from("nest-room-media").remove([photoPath])
        throw error
      }
    },
    onSuccess: () => { toast.success("Room contents recorded"); resetItemForm(); void queryClient.invalidateQueries({ queryKey: ["nest-room-items"] }) },
    onError: (error: any) => toast.error(error.message || "Room contents could not be saved"),
  })

  const createIssue = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before reporting an issue")
      if (!issueForm.room_id || !issueForm.title.trim() || !issueForm.description.trim()) throw new Error("Room, title and description are required")
      const { error } = await (supabase as any).from("nest_room_issues").insert({
        room_id: issueForm.room_id,
        stay_id: issueForm.stay_id || null,
        title: issueForm.title.trim(),
        description: issueForm.description.trim(),
        severity: issueForm.severity,
        status: "open",
        reported_by: userId,
        assigned_to: issueForm.assigned_to || null,
        next_use_blocked: issueForm.next_use_blocked,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success("Room issue reported"); resetIssueForm(); void queryClient.invalidateQueries({ queryKey: ["nest-room-issues"] }) },
    onError: (error: any) => toast.error(error.message || "Room issue could not be reported"),
  })

  const resolveIssue = useMutation({
    mutationFn: async (id: string) => {
      const notes = (resolutionDrafts[id] || "").trim()
      if (!notes) throw new Error("Add resolution notes before closing the issue")
      const { error } = await (supabase as any).from("nest_room_issues").update({ status: "resolved", resolved_at: new Date().toISOString(), resolution_notes: notes, next_use_blocked: false }).eq("id", id)
      if (error) throw error
    },
    onSuccess: (_, id) => { toast.success("Issue resolved and room history updated"); setResolutionDrafts((current) => ({ ...current, [id]: "" })); void queryClient.invalidateQueries({ queryKey: ["nest-room-issues"] }); void queryClient.invalidateQueries({ queryKey: ["nest-room-blocking-issues"] }) },
    onError: (error: any) => toast.error(error.message || "Issue could not be resolved"),
  })

  const arrivalRows = useMemo(() => {
    const context = papasQuery.data
    if (!context) return []
    const itineraryById = new Map<string, any>((context.itineraries || []).map((itinerary: any) => [itinerary.id, itinerary] as [string, any]))
    return (context.papas || []).map((papa: any) => {
      const legs = (context.legs || []).filter((leg: any) => {
        const itinerary: any = itineraryById.get(leg.itinerary_id)
        return leg.papa_id === papa.id || itinerary?.papa_id === papa.id
      }).sort((a: any, b: any) => Number(a.leg_order || a.sequence || 0) - Number(b.leg_order || b.sequence || 0))
      if (!legs.length && papa.flight_number) legs.push({ id: `legacy-${papa.id}`, flight_number: papa.flight_number, airline: papa.airline || papa.flight_provider, origin: null, destination: [papa.arrival_city, papa.arrival_country].filter(Boolean).join(", "), scheduled_departure: papa.flight_departure_time || papa.departure_date, scheduled_arrival: papa.flight_arrival_time || papa.arrival_date, status: "scheduled" })
      return { papa, legs }
    })
  }, [papasQuery.data])

  const roomReadiness = visibleRooms.length
    ? Math.round((visibleRooms.filter((room: any) => room.status === "ready" && !blockedRoomIds.has(room.id)).length / visibleRooms.length) * 100)
    : 0

  return (
    <section className="space-y-4" aria-labelledby="room-operations-title">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl"><div className="flex items-center gap-2"><BedDouble className="h-4 w-4 text-indigo-600" /><p className="text-xs font-semibold tracking-[0.16em] text-indigo-700 dark:text-indigo-400">ROOM OPERATIONS</p></div><h2 id="room-operations-title" className="mt-2 text-xl font-semibold tracking-tight">Guest readiness and Nest history</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Prepare rooms, assign shared stays, confirm inspections, photograph gifts and close defects before the next guest arrives.</p></div>
          <div className="flex items-center gap-4 rounded-xl bg-indigo-500/7 px-4 py-3"><div><p className="text-3xl font-semibold tabular-nums">{roomReadiness}%</p><p className="text-[10px] text-muted-foreground">rooms ready</p></div><div className="h-10 w-px bg-border" /><div className="space-y-1 text-xs"><p><strong>{visibleRooms.length}</strong> rooms tracked</p><p className={openIssues.length ? "text-amber-600" : "text-muted-foreground"}><strong>{openIssues.length}</strong> open issues</p></div></div>
        </div>
      </div>

      <Tabs defaultValue="arrivals" className="w-full">
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
          <TabsTrigger value="arrivals" className="gap-2"><Plane className="h-3.5 w-3.5" />Arrivals</TabsTrigger>
          <TabsTrigger value="rooms" className="gap-2"><BedDouble className="h-3.5 w-3.5" />Rooms</TabsTrigger>
          <TabsTrigger value="stays" className="gap-2"><UsersRound className="h-3.5 w-3.5" />Stays</TabsTrigger>
          <TabsTrigger value="inspections" className="gap-2"><ClipboardCheck className="h-3.5 w-3.5" />Inspections</TabsTrigger>
          <TabsTrigger value="contents" className="gap-2"><Gift className="h-3.5 w-3.5" />Contents</TabsTrigger>
          <TabsTrigger value="issues" className="gap-2"><Wrench className="h-3.5 w-3.5" />Issues</TabsTrigger>
        </TabsList>

        <TabsContent value="arrivals" className="space-y-3">
          {papasQuery.isError ? <QueryNotice title="Papa arrival details could not be loaded" onRetry={() => void papasQuery.refetch()} /> : papasQuery.isLoading ? <div className="flex justify-center rounded-xl border py-14"><Loader2 className="h-5 w-5 animate-spin" /></div> : arrivalRows.length === 0 ? <div className="rounded-xl border border-dashed py-14 text-center"><Plane className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No Papa arrivals for this program</p></div> : arrivalRows.map(({ papa, legs }: any) => (
            <article key={papa.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs text-muted-foreground">Expected guest</p><h3 className="text-lg font-semibold">{[papa.title, papa.full_name].filter(Boolean).join(" ")}</h3><p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Arrival {fmtDate(papa.arrival_date || papa.flight_arrival_time)}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{papa.entourage_count ?? papa.entourage_size ?? 0} entourage</Badge>{papa.arrival_city && <Badge variant="secondary">{papa.arrival_city}</Badge>}</div></div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
                <div className="space-y-3 rounded-lg bg-muted/30 p-3"><div className="flex items-start gap-2"><Utensils className="mt-0.5 h-4 w-4 text-indigo-500" /><div><p className="text-xs font-medium">Dietary and allergy notes</p><p className="mt-1 text-sm text-muted-foreground">{papa.dietary_restrictions || papa.food_preferences || "No dietary restriction recorded"}</p></div></div>{papa.special_requirements && <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 text-amber-500" /><div><p className="text-xs font-medium">Special requirements</p><p className="mt-1 text-sm text-muted-foreground">{papa.special_requirements}</p></div></div>}</div>
                <div className="space-y-2">{legs.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Flight itinerary pending</p> : legs.map((leg: any, index: number) => <div key={leg.id || index} className="rounded-lg border p-3"><div className="flex items-center justify-between"><p className="font-mono text-sm font-semibold">{leg.flight_number || leg.adsb_callsign || leg.callsign || "Flight pending"}</p><Badge variant={badgeForStatus(leg.status)}>{leg.status || "scheduled"}</Badge></div><div className="mt-2 flex items-center gap-2 text-xs"><span>{leg.origin || leg.departure_airport || "Origin pending"}</span><ArrowRight className="h-3 w-3 text-muted-foreground" /><span>{leg.destination || leg.arrival_airport || "Destination pending"}</span></div><p className="mt-2 text-xs text-muted-foreground">Arrives {fmtDate(leg.estimated_arrival || leg.scheduled_arrival || leg.arrival_at)}</p></div>)}</div>
              </div>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          {roomsQuery.isError && <QueryNotice title="Room records are not available yet" onRetry={() => void roomsQuery.refetch()} />}
          {canManage && <form onSubmit={(event) => { event.preventDefault(); createRoom.mutate() }} className="grid gap-3 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[1.2fr_.65fr_1fr_.7fr_.7fr_auto] lg:items-end"><div className="space-y-2"><Label>Nest</Label><Select value={roomForm.nest_id || "none"} onValueChange={(value) => setRoomForm((current) => ({ ...current, nest_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Choose Nest" /></SelectTrigger><SelectContent><SelectItem value="none">Choose Nest</SelectItem>{visibleNests.map((nest: any) => <SelectItem key={nest.id} value={nest.id}>{nest.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="room-number">Room</Label><Input id="room-number" required value={roomForm.room_number} onChange={(event) => setRoomForm((current) => ({ ...current, room_number: event.target.value }))} placeholder="1204" /></div><div className="space-y-2"><Label htmlFor="room-name">Name</Label><Input id="room-name" value={roomForm.name} onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))} placeholder="Executive suite" /></div><div className="space-y-2"><Label>Type</Label><Select value={roomForm.room_type} onValueChange={(value) => setRoomForm((current) => ({ ...current, room_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="suite">Suite</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="apartment">Apartment</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="room-floor">Floor</Label><Input id="room-floor" value={roomForm.floor} onChange={(event) => setRoomForm((current) => ({ ...current, floor: event.target.value }))} /></div><Button type="submit" disabled={createRoom.isPending} className="gap-2"><Plus className="h-4 w-4" />Add room</Button></form>}
          {visibleRooms.length === 0 ? <div className="rounded-xl border border-dashed py-14 text-center"><BedDouble className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No rooms tracked for this view</p></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleRooms.map((room: any) => { const roomIssues = openIssues.filter((issue: any) => issue.room_id === room.id); const latestInspection = visibleInspections.filter((inspection: any) => inspection.room_id === room.id).sort((a: any, b: any) => new Date(b.inspected_at || b.due_at || 0).getTime() - new Date(a.inspected_at || a.due_at || 0).getTime())[0]; return <article key={room.id} className={`rounded-xl border p-4 ${blockedRoomIds.has(room.id) ? "border-destructive/35 bg-destructive/5" : "bg-card"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{nestById.get(room.nest_id)?.name || "Nest"}</p><h3 className="mt-0.5 text-lg font-semibold">{room.name || `Room ${room.room_number}`}</h3><p className="text-xs text-muted-foreground">{room.room_type || "Room"}{room.floor ? ` · Floor ${room.floor}` : ""}</p></div><Badge variant={badgeForStatus(blockedRoomIds.has(room.id) ? "out_of_service" : room.status)}>{blockedRoomIds.has(room.id) ? "Blocked" : room.status || "preparing"}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/40 p-2"><p className="text-muted-foreground">Last inspection</p><p className="mt-1 font-medium">{latestInspection ? latestInspection.status : "Not inspected"}</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-muted-foreground">Open issues</p><p className="mt-1 font-medium tabular-nums">{roomIssues.length}</p></div></div>{canManage && <div className="mt-3"><Select value={room.status || "preparing"} onValueChange={(status) => updateRoomStatus.mutate({ roomId: room.id, status })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="preparing">Preparing</SelectItem><SelectItem value="ready">Ready</SelectItem><SelectItem value="occupied">Occupied</SelectItem><SelectItem value="out_of_service">Out of service</SelectItem></SelectContent></Select></div>}</article> })}</div>}
        </TabsContent>

        <TabsContent value="stays" className="space-y-4">
          {staysQuery.isError && <QueryNotice title="Guest stays are not available yet" onRetry={() => void staysQuery.refetch()} />}
          {canManage && <form onSubmit={(event) => { event.preventDefault(); createStay.mutate() }} className="space-y-4 rounded-xl border bg-muted/20 p-4"><div><h3 className="font-semibold">Assign a room stay</h3><p className="mt-1 text-xs text-muted-foreground">The Papa is the primary occupant. Add every guest sharing the room on a separate line.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label>Room</Label><Select value={stayForm.room_id || "none"} onValueChange={(value) => setStayForm((current) => ({ ...current, room_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose room</SelectItem>{visibleRooms.filter((room: any) => !blockedRoomIds.has(room.id)).map((room: any) => <SelectItem key={room.id} value={room.id}>{nestById.get(room.nest_id)?.name} · {room.room_number}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Papa</Label><Select value={stayForm.papa_id || "none"} onValueChange={(value) => setStayForm((current) => ({ ...current, papa_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose Papa</SelectItem>{(papasQuery.data?.papas || []).map((papa: any) => <SelectItem key={papa.id} value={papa.id}>{[papa.title, papa.full_name].filter(Boolean).join(" ")}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="planned-check-in">Planned check-in</Label><Input id="planned-check-in" type="datetime-local" required value={stayForm.planned_check_in} onChange={(event) => setStayForm((current) => ({ ...current, planned_check_in: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="planned-check-out">Planned check-out</Label><Input id="planned-check-out" type="datetime-local" required value={stayForm.planned_check_out} onChange={(event) => setStayForm((current) => ({ ...current, planned_check_out: event.target.value }))} /></div></div><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="shared-guests">Other guests sharing this room</Label><Textarea id="shared-guests" value={stayForm.guest_names} onChange={(event) => setStayForm((current) => ({ ...current, guest_names: event.target.value }))} placeholder="One full name per line" /></div><div className="space-y-2"><Label htmlFor="stay-requests">Special requests</Label><Textarea id="stay-requests" value={stayForm.special_requests} onChange={(event) => setStayForm((current) => ({ ...current, special_requests: event.target.value }))} /></div></div><div className="flex justify-end"><Button type="submit" disabled={createStay.isPending}>{createStay.isPending ? "Assigning…" : "Assign stay"}</Button></div></form>}
          <div className="space-y-3">{visibleStays.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No room stays assigned.</p> : visibleStays.map((stay: any) => { const room = roomById.get(stay.room_id); const papa = papaById.get(stay.papa_id); const stayGuests = guests.filter((guest: any) => guest.stay_id === stay.id); return <article key={stay.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{[papa?.title, papa?.full_name].filter(Boolean).join(" ") || "Guest stay"}</h3><Badge variant={badgeForStatus(stay.status)}>{stay.status || "planned"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{nestById.get(room?.nest_id)?.name} · Room {room?.room_number}</p></div>{canManage && <div className="flex gap-2">{stay.status === "planned" && <Button size="sm" variant="outline" className="gap-2" onClick={() => updateStayStatus.mutate({ stayId: stay.id, status: "checked_in" })}><LogIn className="h-3.5 w-3.5" />Check in</Button>}{stay.status === "checked_in" && <Button size="sm" variant="outline" className="gap-2" onClick={() => updateStayStatus.mutate({ stayId: stay.id, status: "checked_out" })}><LogOut className="h-3.5 w-3.5" />Check out</Button>}</div>}</div><div className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><div><p className="text-muted-foreground">Planned</p><p className="mt-1 font-medium">{fmtDate(stay.planned_check_in)} — {fmtDate(stay.planned_check_out)}</p></div><div><p className="text-muted-foreground">Actual</p><p className="mt-1 font-medium">{stay.actual_check_in ? fmtDate(stay.actual_check_in) : "Not checked in"}{stay.actual_check_out ? ` — ${fmtDate(stay.actual_check_out)}` : ""}</p></div><div><p className="text-muted-foreground">Occupants</p><p className="mt-1 font-medium">{stayGuests.map((guest: any) => guest.full_name).join(", ") || "Guest names pending"}</p></div></div></article> })}</div>
        </TabsContent>

        <TabsContent value="inspections" className="space-y-4">
          {inspectionsQuery.isError && <QueryNotice title="Room inspections are not available yet" onRetry={() => void inspectionsQuery.refetch()} />}
          {canManage && <form onSubmit={(event) => { event.preventDefault(); createInspection.mutate() }} className="grid gap-3 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"><div className="space-y-2"><Label>Room</Label><Select value={inspectionForm.room_id || "none"} onValueChange={(value) => setInspectionForm((current) => ({ ...current, room_id: value === "none" ? "" : value, stay_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose room</SelectItem>{visibleRooms.map((room: any) => <SelectItem key={room.id} value={room.id}>{nestById.get(room.nest_id)?.name} · {room.room_number}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Stay</Label><Select value={inspectionForm.stay_id || "none"} onValueChange={(value) => setInspectionForm((current) => ({ ...current, stay_id: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">General room inspection</SelectItem>{visibleStays.filter((stay: any) => !inspectionForm.room_id || stay.room_id === inspectionForm.room_id).map((stay: any) => <SelectItem key={stay.id} value={stay.id}>{papaById.get(stay.papa_id)?.full_name || "Guest stay"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Inspector</Label><Select value={inspectionForm.assigned_to || "none"} onValueChange={(value) => setInspectionForm((current) => ({ ...current, assigned_to: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose inspector</SelectItem>{people.map((person: any) => <SelectItem key={person.id} value={person.id}>{person.full_name || "Officer"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="inspection-due">Due</Label><Input id="inspection-due" type="datetime-local" required value={inspectionForm.due_at} onChange={(event) => setInspectionForm((current) => ({ ...current, due_at: event.target.value }))} /></div><Button type="submit" disabled={createInspection.isPending}>Assign</Button></form>}
          <div className="grid gap-3 lg:grid-cols-2">{visibleInspections.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground lg:col-span-2">No room inspections assigned.</p> : visibleInspections.map((inspection: any) => { const room = roomById.get(inspection.room_id); const inspector = personById.get(inspection.assigned_to); const completedBy = personById.get(inspection.inspected_by); const canConfirm = canManage || inspection.assigned_to === userId; return <article key={inspection.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{nestById.get(room?.nest_id)?.name} · Room {room?.room_number}</p><p className="mt-1 text-xs text-muted-foreground">Assigned to {inspector?.full_name || "Nest officer"} · Due {fmtDate(inspection.due_at)}</p></div><Badge variant={badgeForStatus(inspection.status)}>{inspection.status || "assigned"}</Badge></div>{inspection.inspected_at && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><UserRoundCheck className="h-3.5 w-3.5" />Confirmed by {completedBy?.full_name || "Nest officer"} at {fmtDate(inspection.inspected_at)}</p>}{canConfirm && !["passed", "attention"].includes(inspection.status) && <div className="mt-4 flex gap-2 border-t pt-3"><Button type="button" size="sm" className="gap-2" onClick={() => completeInspection.mutate({ id: inspection.id, status: "passed" })}><CheckCircle2 className="h-3.5 w-3.5" />Room passed</Button><Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => completeInspection.mutate({ id: inspection.id, status: "attention" })}><AlertTriangle className="h-3.5 w-3.5" />Needs attention</Button></div>}</article> })}</div>
        </TabsContent>

        <TabsContent value="contents" className="space-y-4">
          {itemsQuery.isError && <QueryNotice title="Room contents are not available yet" onRetry={() => void itemsQuery.refetch()} />}
          {canContribute && <form onSubmit={(event) => { event.preventDefault(); createItem.mutate() }} className="space-y-4 rounded-xl border bg-muted/20 p-4"><div><h3 className="font-semibold">Record room contents or gifts</h3><p className="mt-1 text-xs text-muted-foreground">Photos are stored privately and displayed with time-limited links.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><div className="space-y-2"><Label>Room</Label><Select value={itemForm.room_id || "none"} onValueChange={(value) => setItemForm((current) => ({ ...current, room_id: value === "none" ? "" : value, stay_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose room</SelectItem>{visibleRooms.map((room: any) => <SelectItem key={room.id} value={room.id}>{nestById.get(room.nest_id)?.name} · {room.room_number}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="item-name">Item</Label><Input id="item-name" required value={itemForm.item_name} onChange={(event) => setItemForm((current) => ({ ...current, item_name: event.target.value }))} placeholder="Welcome hamper" /></div><div className="space-y-2"><Label>Category</Label><Select value={itemForm.category} onValueChange={(value) => setItemForm((current) => ({ ...current, category: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gift">Gift</SelectItem><SelectItem value="amenity">Amenity</SelectItem><SelectItem value="food">Food</SelectItem><SelectItem value="welcome_note">Welcome note</SelectItem><SelectItem value="equipment">Equipment</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="item-quantity">Quantity</Label><Input id="item-quantity" type="number" min={1} value={itemForm.quantity} onChange={(event) => setItemForm((current) => ({ ...current, quantity: Math.max(1, Number(event.target.value)) }))} /></div><div className="space-y-2"><Label htmlFor="item-photo">Photo</Label><Input id="item-photo" type="file" accept="image/*" onChange={(event) => setItemPhoto(event.target.files?.[0] || null)} /></div></div><div className="flex justify-end"><Button type="submit" disabled={createItem.isPending} className="gap-2"><PackageCheck className="h-4 w-4" />{createItem.isPending ? "Saving…" : "Save contents"}</Button></div></form>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{visibleItems.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">No room contents recorded.</p> : visibleItems.map((item: any) => { const room = roomById.get(item.room_id); return <article key={item.id} className="overflow-hidden rounded-xl border bg-card">{item.photo_url ? <img src={item.photo_url} alt={`${item.item_name} in room ${room?.room_number || ""}`} className="aspect-[16/9] w-full object-cover" /> : <div className="flex aspect-[16/9] items-center justify-center bg-muted/40"><ImageIcon className="h-8 w-8 text-muted-foreground/30" /></div>}<div className="p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-medium">{item.item_name}</h3><p className="mt-1 text-xs text-muted-foreground">Room {room?.room_number} · Qty {item.quantity}</p></div><Badge variant="outline">{item.category}</Badge></div>{item.notes && <p className="mt-3 text-xs text-muted-foreground">{item.notes}</p>}</div></article> })}</div>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          {issuesQuery.isError && <QueryNotice title="Room issue history is not available yet" onRetry={() => void issuesQuery.refetch()} />}
          {canContribute && <form onSubmit={(event) => { event.preventDefault(); createIssue.mutate() }} className="space-y-4 rounded-xl border bg-muted/20 p-4"><div><h3 className="font-semibold">Report a room defect</h3><p className="mt-1 text-xs text-muted-foreground">Block future use when a defect could affect the next guest.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label>Room</Label><Select value={issueForm.room_id || "none"} onValueChange={(value) => setIssueForm((current) => ({ ...current, room_id: value === "none" ? "" : value, stay_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose room</SelectItem>{visibleRooms.map((room: any) => <SelectItem key={room.id} value={room.id}>{nestById.get(room.nest_id)?.name} · {room.room_number}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="issue-title">Issue</Label><Input id="issue-title" required value={issueForm.title} onChange={(event) => setIssueForm((current) => ({ ...current, title: event.target.value }))} placeholder="Air conditioning fault" /></div><div className="space-y-2"><Label>Severity</Label><Select value={issueForm.severity} onValueChange={(value) => setIssueForm((current) => ({ ...current, severity: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Assign to</Label><Select value={issueForm.assigned_to || "none"} onValueChange={(value) => setIssueForm((current) => ({ ...current, assigned_to: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{people.map((person: any) => <SelectItem key={person.id} value={person.id}>{person.full_name || "Officer"}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label htmlFor="issue-description">Description</Label><Textarea id="issue-description" required value={issueForm.description} onChange={(event) => setIssueForm((current) => ({ ...current, description: event.target.value }))} /></div><label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-background p-3"><div><p className="text-sm font-medium">Block this room from future use</p><p className="text-xs text-muted-foreground">Use for safety, hygiene or comfort defects that must be resolved first.</p></div><Switch checked={issueForm.next_use_blocked} onCheckedChange={(checked) => setIssueForm((current) => ({ ...current, next_use_blocked: checked }))} /></label><div className="flex justify-end"><Button type="submit" disabled={createIssue.isPending} className="gap-2"><ShieldAlert className="h-4 w-4" />Report issue</Button></div></form>}
          <div className="space-y-3">{visibleIssues.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No room issues recorded.</p> : visibleIssues.map((issue: any) => { const room = roomById.get(issue.room_id); const assignee = personById.get(issue.assigned_to); const canResolve = canManage || issue.assigned_to === userId; return <article key={issue.id} className={`rounded-xl border p-4 ${issue.next_use_blocked && issue.status !== "resolved" ? "border-destructive/35 bg-destructive/5" : ""}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{issue.title}</h3><Badge variant={issue.severity === "critical" ? "destructive" : issue.severity === "high" ? "warning" : "outline"}>{issue.severity}</Badge>{issue.next_use_blocked && issue.status !== "resolved" && <Badge variant="destructive">Next use blocked</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{nestById.get(room?.nest_id)?.name} · Room {room?.room_number}{assignee?.full_name ? ` · Assigned to ${assignee.full_name}` : ""}</p></div><Badge variant={badgeForStatus(issue.status)}>{issue.status || "open"}</Badge></div><p className="mt-3 text-sm leading-relaxed">{issue.description}</p>{issue.status === "resolved" ? <div className="mt-3 rounded-lg bg-emerald-500/8 p-3 text-xs"><p className="font-medium text-emerald-700 dark:text-emerald-400">Resolved {fmtDate(issue.resolved_at)}</p><p className="mt-1 text-muted-foreground">{issue.resolution_notes}</p></div> : canResolve && <div className="mt-4 flex flex-col gap-2 border-t pt-3 sm:flex-row"><Input value={resolutionDrafts[issue.id] || ""} onChange={(event) => setResolutionDrafts((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="Describe the repair or resolution" /><Button type="button" className="shrink-0" onClick={() => resolveIssue.mutate(issue.id)}>Resolve issue</Button></div>}</article> })}</div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
