"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Activity,
  Bell,
  CalendarHeart,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Gift,
  HandHeart,
  HeartHandshake,
  Loader2,
  LockKeyhole,
  Megaphone,
  PartyPopper,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { cn, isPlatformAdministrator } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const supabase = createClient()

type Unit = { id: string; slug: string }
type UnitMembership = { unit_id: string; user_id: string; access_level: string; status: string }
type Officer = { id: string; full_name: string | null; email: string | null; oscar: string | null }
type Program = { id: string; name: string }
type Schedule = { id: string; topic: string; session_date: string }
type PrayerCampaign = {
  id: string
  title: string
  kind: string
  program_id: string | null
  training_schedule_id: string | null
  starts_at: string
  ends_at: string
  timezone: string
  status: string
  description: string | null
  created_by: string | null
}
type PrayerSlot = {
  id: string
  campaign_id: string
  label: string
  start_at: string
  end_at: string
  subject_user_id: string | null
  team_name: string | null
  notes: string | null
  status: string
}
type PrayerSlotMember = { slot_id: string; user_id: string; assigned_by: string | null }
type WelfareCase = {
  id: string
  case_type: "visit" | "charity" | "member_support" | "emergency"
  title: string
  description: string | null
  target_user_id: string | null
  beneficiary_name: string | null
  event_at: string | null
  status: string
  privacy: string
  assigned_to: string | null
  created_by: string | null
}
type WelfareCelebration = {
  id: string
  celebration_type: "birthday" | "wedding"
  target_user_id: string | null
  celebrant_name: string | null
  event_date: string
  title: string
  message: string | null
  status: string
  published_at: string | null
  created_by: string | null
}

const MANAGER_ACCESS = new Set(["head", "head_of_unit", "manager", "admin"])
const CASE_TYPES = {
  visit: { label: "Visit", icon: HeartHandshake, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  charity: { label: "Charity", icon: HandHeart, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  member_support: { label: "Member support", icon: ShieldCheck, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  emergency: { label: "Emergency", icon: Activity, tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
} as const

function formatDateTime(value: string | null, timeZone = "Africa/Lagos") {
  if (!value) return "Not scheduled"
  return new Intl.DateTimeFormat("en-NG", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatWatch(value: string, timeZone = "Africa/Lagos") {
  return new Intl.DateTimeFormat("en-NG", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value))
}

function lagosDateTime(value: string) {
  return new Date(`${value.length === 16 ? `${value}:00` : value}+01:00`)
}

function statusClass(status: string) {
  if (["active", "in_progress", "published", "completed", "resolved", "confirmed"].includes(status)) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (["cancelled", "closed"].includes(status)) return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
  return "border-border bg-muted/60 text-muted-foreground"
}

export default function WelfareOperations() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState("prayer")
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false)
  const [slotDialogOpen, setSlotDialogOpen] = useState(false)
  const [caseDialogOpen, setCaseDialogOpen] = useState(false)
  const [celebrationDialogOpen, setCelebrationDialogOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<PrayerSlot | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [caseFilter, setCaseFilter] = useState("all")
  const [celebrationFilter, setCelebrationFilter] = useState("all")
  const [campaignForm, setCampaignForm] = useState({ title: "", kind: "prayer_chain", program_id: "", training_schedule_id: "", starts_at: "", ends_at: "", description: "" })
  const [slotForm, setSlotForm] = useState({ label: "", team_name: "", subject_user_id: "", notes: "", status: "scheduled" })
  const [caseForm, setCaseForm] = useState({ case_type: "visit" as WelfareCase["case_type"], title: "", description: "", target_user_id: "", beneficiary_name: "", event_at: "", privacy: "welfare_only", assigned_to: "" })
  const [celebrationForm, setCelebrationForm] = useState({ celebration_type: "birthday" as WelfareCelebration["celebration_type"], target_user_id: "", celebrant_name: "", event_date: "", title: "", message: "", status: "draft" })

  useEffect(() => {
    const openCelebrations = () => setActiveTab("celebrations")
    window.addEventListener("welfare-open-celebrations", openCelebrations)
    return () => window.removeEventListener("welfare-open-celebrations", openCelebrations)
  }, [])

  const unitQuery = useQuery({
    queryKey: ["unit-by-slug", "welfare"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("units").select("id, slug").eq("slug", "welfare").maybeSingle()
      if (error) throw error
      return data as Unit | null
    },
  })

  const membershipQuery = useQuery({
    queryKey: ["unit-membership", unitQuery.data?.id, currentUser?.id],
    enabled: Boolean(unitQuery.data?.id && currentUser?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("unit_memberships").select("unit_id, user_id, access_level, status").eq("unit_id", unitQuery.data!.id).eq("user_id", currentUser!.id).eq("status", "active").maybeSingle()
      if (error) throw error
      return data as UnitMembership | null
    },
  })

  const canManage = Boolean(isPlatformAdministrator(currentUser?.role) || (membershipQuery.data?.status === "active" && MANAGER_ACCESS.has(membershipQuery.data.access_level)))

  const campaignsQuery = useQuery({
    queryKey: ["welfare-prayer-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prayer_campaigns").select("*").order("starts_at", { ascending: false }).limit(80)
      if (error) throw error
      return (data ?? []) as PrayerCampaign[]
    },
  })
  const campaignIds = useMemo(() => (campaignsQuery.data ?? []).map((campaign) => campaign.id), [campaignsQuery.data])

  const slotsQuery = useQuery({
    queryKey: ["welfare-prayer-slots", campaignIds.join(",")],
    enabled: campaignIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prayer_slots").select("*").in("campaign_id", campaignIds).order("start_at", { ascending: true })
      if (error) throw error
      return (data ?? []) as PrayerSlot[]
    },
  })
  const slotIds = useMemo(() => (slotsQuery.data ?? []).map((slot) => slot.id), [slotsQuery.data])

  const slotMembersQuery = useQuery({
    queryKey: ["welfare-prayer-slot-members", slotIds.join(",")],
    enabled: slotIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prayer_slot_members").select("slot_id, user_id, assigned_by").in("slot_id", slotIds)
      if (error) throw error
      return (data ?? []) as PrayerSlotMember[]
    },
  })

  const casesQuery = useQuery({
    queryKey: ["welfare-care-cases", currentUser?.id, canManage],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("welfare_cases").select("*").order("event_at", { ascending: false, nullsFirst: false }).limit(120)
      if (error) throw error
      return (data ?? []) as WelfareCase[]
    },
  })

  const celebrationsQuery = useQuery({
    queryKey: ["welfare-celebrations", canManage],
    queryFn: async () => {
      let query = (supabase as any).from("welfare_celebrations").select("*").order("event_date", { ascending: false }).limit(120)
      if (!canManage) query = query.eq("status", "published")
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as WelfareCelebration[]
    },
  })

  const officersQuery = useQuery({
    queryKey: ["active-officers-lite", "welfare-operations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, full_name, email, oscar").eq("is_active", true).order("full_name", { ascending: true })
      if (error) throw error
      return (data ?? []) as Officer[]
    },
  })

  const programsQuery = useQuery({
    queryKey: ["programs-lite", "welfare-operations"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name").order("created_at", { ascending: false }).limit(80)
      if (error) throw error
      return (data ?? []) as Program[]
    },
  })

  const schedulesQuery = useQuery({
    queryKey: ["training-schedules-lite", "welfare-operations"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("training_schedules").select("id, topic, session_date").order("session_date", { ascending: false }).limit(80)
      if (error) throw error
      return (data ?? []) as Schedule[]
    },
  })

  const campaigns = campaignsQuery.data ?? []
  const slots = slotsQuery.data ?? []
  const slotMembers = slotMembersQuery.data ?? []
  const cases = casesQuery.data ?? []
  const celebrations = celebrationsQuery.data ?? []
  const officers = officersQuery.data ?? []
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null
  const selectedCampaignSlots = selectedCampaign ? slots.filter((slot) => slot.campaign_id === selectedCampaign.id) : []
  const myUpcomingWatches = slots.filter((slot) => slotMembers.some((member) => member.slot_id === slot.id && member.user_id === currentUser?.id) && new Date(slot.end_at) >= new Date()).length
  const openCases = cases.filter((item) => !["resolved", "closed", "cancelled"].includes(item.status)).length
  const publishedCelebrations = celebrations.filter((item) => item.status === "published").length
  const filteredCases = caseFilter === "all" ? cases : cases.filter((item) => item.case_type === caseFilter)
  const filteredCelebrations = celebrationFilter === "all" ? celebrations : celebrations.filter((item) => item.celebration_type === celebrationFilter)

  const invalidatePrayer = () => {
    queryClient.invalidateQueries({ queryKey: ["welfare-prayer-campaigns"] })
    queryClient.invalidateQueries({ queryKey: ["welfare-prayer-slots"] })
    queryClient.invalidateQueries({ queryKey: ["welfare-prayer-slot-members"] })
  }

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) throw new Error("Your profile is still loading")
      const startsAt = lagosDateTime(campaignForm.starts_at)
      const endsAt = lagosDateTime(campaignForm.ends_at)
      const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000
      if (durationHours <= 0) throw new Error("End time must be after start time")
      if (durationHours > 72) throw new Error("Prayer chains can span up to 72 hours at a time")
      const { data, error } = await (supabase as any).from("prayer_campaigns").insert({
        title: campaignForm.title.trim(),
        kind: campaignForm.kind,
        program_id: campaignForm.program_id || null,
        training_schedule_id: campaignForm.training_schedule_id || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        timezone: "Africa/Lagos",
        status: "published",
        description: campaignForm.description.trim() || null,
        created_by: currentUser.id,
      }).select("id").single()
      if (error) throw error

      const watches: Array<Record<string, unknown>> = []
      let cursor = startsAt.getTime()
      let watchNumber = 1
      while (cursor < endsAt.getTime()) {
        const next = Math.min(cursor + 3_600_000, endsAt.getTime())
        watches.push({ campaign_id: data.id, label: `Prayer watch ${watchNumber}`, start_at: new Date(cursor).toISOString(), end_at: new Date(next).toISOString(), status: "scheduled" })
        cursor = next
        watchNumber += 1
      }
      if (watches.length) {
        const { error: slotsError } = await (supabase as any).from("prayer_slots").insert(watches)
        if (slotsError) {
          await (supabase as any).from("prayer_campaigns").delete().eq("id", data.id)
          throw slotsError
        }
      }
      return data.id as string
    },
    onSuccess: (campaignId) => {
      toast.success("Prayer chain created with hourly watches")
      setSelectedCampaignId(campaignId)
      setCampaignDialogOpen(false)
      setCampaignForm({ title: "", kind: "prayer_chain", program_id: "", training_schedule_id: "", starts_at: "", ends_at: "", description: "" })
      invalidatePrayer()
    },
    onError: (error: Error) => toast.error(error.message || "Could not create prayer chain"),
  })

  const saveSlotMutation = useMutation({
    mutationFn: async () => {
      if (!editingSlot || !currentUser?.id) throw new Error("Prayer watch is unavailable")
      const { error } = await (supabase as any).from("prayer_slots").update({
        label: slotForm.label.trim(),
        team_name: slotForm.team_name.trim() || null,
        subject_user_id: slotForm.subject_user_id || null,
        notes: slotForm.notes.trim() || null,
        status: slotForm.status,
      }).eq("id", editingSlot.id)
      if (error) throw error

      const existingIds = slotMembers.filter((member) => member.slot_id === editingSlot.id).map((member) => member.user_id)
      const removeIds = existingIds.filter((id) => !selectedMemberIds.includes(id))
      const addIds = selectedMemberIds.filter((id) => !existingIds.includes(id))
      if (removeIds.length) {
        const { error: removeError } = await (supabase as any).from("prayer_slot_members").delete().eq("slot_id", editingSlot.id).in("user_id", removeIds)
        if (removeError) throw removeError
      }
      if (addIds.length) {
        const { error: addError } = await (supabase as any).from("prayer_slot_members").insert(addIds.map((userId) => ({ slot_id: editingSlot.id, user_id: userId, assigned_by: currentUser.id })))
        if (addError) throw addError
      }
    },
    onSuccess: () => {
      toast.success("Prayer watch updated")
      setSlotDialogOpen(false)
      invalidatePrayer()
    },
    onError: (error: Error) => toast.error(error.message || "Could not update prayer watch"),
  })

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) throw new Error("Your profile is still loading")
      const { error } = await (supabase as any).from("welfare_cases").insert({
        case_type: caseForm.case_type,
        title: caseForm.title.trim(),
        description: caseForm.description.trim() || null,
        target_user_id: caseForm.target_user_id || null,
        beneficiary_name: caseForm.beneficiary_name.trim() || null,
        event_at: caseForm.event_at ? lagosDateTime(caseForm.event_at).toISOString() : null,
        status: "planned",
        privacy: caseForm.privacy,
        assigned_to: caseForm.assigned_to || null,
        created_by: currentUser.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Care item created")
      setCaseDialogOpen(false)
      setCaseForm({ case_type: "visit", title: "", description: "", target_user_id: "", beneficiary_name: "", event_at: "", privacy: "welfare_only", assigned_to: "" })
      queryClient.invalidateQueries({ queryKey: ["welfare-care-cases"] })
    },
    onError: (error: Error) => toast.error(error.message || "Could not create care item"),
  })

  const updateCaseStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("welfare_cases").update({ status }).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["welfare-care-cases"] }),
    onError: (error: Error) => toast.error(error.message || "Could not update care item"),
  })

  const createCelebrationMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) throw new Error("Your profile is still loading")
      const { error } = await (supabase as any).from("welfare_celebrations").insert({
        celebration_type: celebrationForm.celebration_type,
        target_user_id: celebrationForm.target_user_id || null,
        celebrant_name: celebrationForm.celebrant_name.trim() || null,
        event_date: celebrationForm.event_date,
        title: celebrationForm.title.trim(),
        message: celebrationForm.message.trim() || null,
        status: celebrationForm.status,
        published_at: celebrationForm.status === "published" ? new Date().toISOString() : null,
        created_by: currentUser.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(celebrationForm.status === "published" ? "Celebration published" : "Celebration saved")
      setCelebrationDialogOpen(false)
      setCelebrationForm({ celebration_type: "birthday", target_user_id: "", celebrant_name: "", event_date: "", title: "", message: "", status: "draft" })
      queryClient.invalidateQueries({ queryKey: ["welfare-celebrations"] })
    },
    onError: (error: Error) => toast.error(error.message || "Could not save celebration"),
  })

  const publishCelebrationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("welfare_celebrations").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Celebration published for the team")
      queryClient.invalidateQueries({ queryKey: ["welfare-celebrations"] })
    },
    onError: (error: Error) => toast.error(error.message || "Could not publish celebration"),
  })

  const openSlot = (slot: PrayerSlot) => {
    setEditingSlot(slot)
    setSlotForm({ label: slot.label, team_name: slot.team_name ?? "", subject_user_id: slot.subject_user_id ?? "", notes: slot.notes ?? "", status: slot.status })
    setSelectedMemberIds(slotMembers.filter((member) => member.slot_id === slot.id).map((member) => member.user_id))
    setSlotDialogOpen(true)
  }

  const submitCampaign = (event: FormEvent) => {
    event.preventDefault()
    if (!campaignForm.title.trim() || !campaignForm.starts_at || !campaignForm.ends_at) return toast.error("Add a title, start and end time")
    createCampaignMutation.mutate()
  }

  const submitCase = (event: FormEvent) => {
    event.preventDefault()
    if (!caseForm.title.trim()) return toast.error("Add a care item title")
    if (!caseForm.target_user_id && !caseForm.beneficiary_name.trim()) return toast.error("Choose a member or enter a beneficiary")
    createCaseMutation.mutate()
  }

  const submitCelebration = (event: FormEvent) => {
    event.preventDefault()
    if (!celebrationForm.title.trim() || !celebrationForm.event_date) return toast.error("Add a title and event date")
    if (!celebrationForm.target_user_id && !celebrationForm.celebrant_name.trim()) return toast.error("Choose a member or enter a celebrant")
    createCelebrationMutation.mutate()
  }

  const hasOperationsError = campaignsQuery.isError || casesQuery.isError || celebrationsQuery.isError

  return (
    <section id="welfare-operations" className="scroll-mt-24 space-y-5" aria-labelledby="welfare-operations-title">
      <div className="relative overflow-hidden rounded-3xl border border-rose-500/15 bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--card))_62%,rgba(244,63,94,0.09)_100%)] p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300"><Sparkles className="h-3.5 w-3.5" /> Whole-person care</div>
            <h2 id="welfare-operations-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Care that is timely, organised and personal.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Coordinate prayer, practical support and team milestones from one private, accountable workspace.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[340px]">
            {[[myUpcomingWatches, "My watches"], [openCases, "Open care"], [publishedCelebrations, "Published"]].map(([value, label]) => <div key={label} className="rounded-2xl border border-border/70 bg-background/70 px-3 py-3 backdrop-blur"><p className="text-xl font-semibold tracking-tight">{value}</p><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p></div>)}
          </div>
        </div>
      </div>

      {hasOperationsError && <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">Some Welfare operations are still being provisioned. Existing menus and officer-care tools remain available.</div>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl p-1 sm:w-auto">
          <TabsTrigger value="prayer"><Clock3 className="mr-2 h-4 w-4" />Prayer</TabsTrigger>
          <TabsTrigger value="care"><HeartHandshake className="mr-2 h-4 w-4" />Care</TabsTrigger>
          <TabsTrigger value="celebrations"><Gift className="mr-2 h-4 w-4" />Celebrations</TabsTrigger>
        </TabsList>

        <TabsContent value="prayer" className="space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-semibold">Prayer campaigns</h3><p className="text-sm text-muted-foreground">Hourly watches for WOFBEC, trainings, events and daily team prayer.</p></div>{canManage && <Button className="gap-2" onClick={() => setCampaignDialogOpen(true)}><Plus className="h-4 w-4" /> New prayer chain</Button>}</div>
          {campaignsQuery.isLoading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : campaigns.length === 0 ? <div className="rounded-3xl border border-dashed px-6 py-14 text-center"><Clock3 className="mx-auto h-9 w-9 text-muted-foreground/45" /><p className="mt-4 font-semibold">No prayer campaigns yet</p><p className="mt-1 text-sm text-muted-foreground">Create a chain and the app will prepare its hourly watches automatically.</p></div> : <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.6fr)]">
            <div className="space-y-2">
              {campaigns.map((campaign) => {
                const active = selectedCampaign?.id === campaign.id
                const assigned = slots.filter((slot) => slot.campaign_id === campaign.id).filter((slot) => slotMembers.some((member) => member.slot_id === slot.id)).length
                const total = slots.filter((slot) => slot.campaign_id === campaign.id).length
                return <button key={campaign.id} type="button" onClick={() => setSelectedCampaignId(campaign.id)} className={cn("w-full rounded-2xl border p-4 text-left transition-all", active ? "border-rose-500/35 bg-rose-500/5 shadow-sm" : "border-border/70 bg-card hover:border-border")}><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-300"><Clock3 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{campaign.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(campaign.starts_at, campaign.timezone)}</p><div className="mt-2 flex items-center justify-between"><Badge variant="outline" className={statusClass(campaign.status)}>{campaign.status}</Badge><span className="text-[11px] text-muted-foreground">{assigned}/{total} assigned</span></div></div><ChevronRight className={cn("mt-2 h-4 w-4 text-muted-foreground transition-transform", active && "rotate-90")} /></div></button>
              })}
            </div>
            <div className="overflow-hidden rounded-3xl border border-border/70 bg-card">
              {selectedCampaign ? <><div className="border-b border-border/70 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge variant="outline" className={statusClass(selectedCampaign.status)}>{selectedCampaign.status}</Badge><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{selectedCampaign.kind.replaceAll("_", " ")}</span></div><h3 className="mt-3 text-xl font-semibold">{selectedCampaign.title}</h3>{selectedCampaign.description && <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{selectedCampaign.description}</p>}</div><div className="rounded-xl bg-muted/60 px-3 py-2 text-right text-xs text-muted-foreground"><p>{formatDateTime(selectedCampaign.starts_at, selectedCampaign.timezone)}</p><p>to {formatDateTime(selectedCampaign.ends_at, selectedCampaign.timezone)}</p></div></div></div><div className="divide-y divide-border/60">
                {selectedCampaignSlots.map((slot) => {
                  const members = slotMembers.filter((member) => member.slot_id === slot.id)
                  const mine = members.some((member) => member.user_id === currentUser?.id)
                  return <div key={slot.id} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-6", mine && "bg-rose-500/5")}><div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border", slot.status === "completed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border bg-background text-muted-foreground")}>{slot.status === "completed" ? <Check className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{slot.label}</p>{mine && <Badge className="border-0 bg-rose-500/15 text-rose-700 dark:text-rose-300">Your watch</Badge>}{slot.team_name && <Badge variant="outline">{slot.team_name}</Badge>}</div><p className="mt-0.5 text-xs text-muted-foreground">{formatWatch(slot.start_at, selectedCampaign.timezone)} – {formatWatch(slot.end_at, selectedCampaign.timezone)}</p><div className="mt-2 flex flex-wrap gap-1.5">{members.length === 0 ? <span className="text-xs text-amber-700 dark:text-amber-300">Awaiting assignment</span> : members.slice(0, 5).map((member) => { const officer = officers.find((item) => item.id === member.user_id); return <span key={member.user_id} className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium">{officer?.full_name || officer?.email || "Officer"}</span> })}{members.length > 5 && <span className="rounded-full bg-muted px-2 py-1 text-[11px]">+{members.length - 5}</span>}</div></div>{canManage && <Button size="sm" variant="outline" onClick={() => openSlot(slot)}>Assign</Button>}</div>
                })}
              </div></> : <div className="p-10 text-center text-sm text-muted-foreground">Select a prayer campaign.</div>}
            </div>
          </div>}
        </TabsContent>

        <TabsContent value="care" className="space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-semibold">Care coordination</h3><p className="text-sm text-muted-foreground">Visits, charity, practical member support and emergency response.</p></div>{canManage && <Button className="gap-2" onClick={() => setCaseDialogOpen(true)}><Plus className="h-4 w-4" /> New care item</Button>}</div>
          <div className="flex gap-2 overflow-x-auto pb-1">{["all", "visit", "charity", "member_support", "emergency"].map((filter) => <Button key={filter} size="sm" variant={caseFilter === filter ? "default" : "outline"} onClick={() => setCaseFilter(filter)} className="shrink-0 capitalize">{filter.replaceAll("_", " ")}</Button>)}</div>
          {casesQuery.isLoading ? <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : filteredCases.length === 0 ? <div className="rounded-3xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">No care items in this view.</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredCases.map((item) => { const config = CASE_TYPES[item.case_type]; const Icon = config.icon; const target = officers.find((officer) => officer.id === item.target_user_id); const owner = officers.find((officer) => officer.id === item.assigned_to); return <article key={item.id} className="rounded-3xl border border-border/70 bg-card p-5"><div className="flex items-start justify-between gap-3"><div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", config.tone)}><Icon className="h-5 w-5" /></div><div className="flex items-center gap-2">{["welfare_only", "assigned"].includes(item.privacy) && <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />}<Badge variant="outline" className={statusClass(item.status)}>{item.status.replaceAll("_", " ")}</Badge></div></div><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{config.label}</p><h4 className="mt-1 font-semibold">{item.title}</h4>{item.description && <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.description}</p>}<div className="mt-4 space-y-1.5 text-xs text-muted-foreground"><p>For: {target?.full_name || item.beneficiary_name || "Not specified"}</p>{item.event_at && <p className="inline-flex items-center gap-1.5"><CalendarHeart className="h-3.5 w-3.5" />{formatDateTime(item.event_at)}</p>}{owner && <p>Owner: {owner.full_name || owner.email}</p>}</div>{canManage && <Select value={item.status} onValueChange={(status) => updateCaseStatusMutation.mutate({ id: item.id, status })}><SelectTrigger className="mt-4 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="planned">Planned</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>}</article> })}</div>}
        </TabsContent>

        <TabsContent value="celebrations" className="space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-semibold">Team milestones</h3><p className="text-sm text-muted-foreground">Birthday posts and wedding announcements, prepared with care.</p></div>{canManage && <Button className="gap-2" onClick={() => setCelebrationDialogOpen(true)}><Plus className="h-4 w-4" /> New celebration</Button>}</div>
          <div className="flex gap-2">{["all", "birthday", "wedding"].map((filter) => <Button key={filter} size="sm" variant={celebrationFilter === filter ? "default" : "outline"} onClick={() => setCelebrationFilter(filter)} className="capitalize">{filter}</Button>)}</div>
          {celebrationsQuery.isLoading ? <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : filteredCelebrations.length === 0 ? <div className="rounded-3xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">No celebrations in this view.</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredCelebrations.map((item) => { const target = officers.find((officer) => officer.id === item.target_user_id); const birthday = item.celebration_type === "birthday"; return <article key={item.id} className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-5"><div className={cn("absolute inset-x-0 top-0 h-1", birthday ? "bg-amber-400" : "bg-rose-400")} /><div className="flex items-start justify-between"><div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", birthday ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600")}>{birthday ? <Gift className="h-5 w-5" /> : <PartyPopper className="h-5 w-5" />}</div><Badge variant="outline" className={statusClass(item.status)}>{item.status}</Badge></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.celebration_type}</p><h4 className="mt-1 text-lg font-semibold">{item.title}</h4><p className="mt-1 text-sm font-medium">{target?.full_name || item.celebrant_name || "Team member"}</p>{item.message && <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{item.message}</p>}<p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarHeart className="h-3.5 w-3.5" />{new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${item.event_date}T00:00:00Z`))}</p>{canManage && item.status !== "published" && <Button size="sm" variant="outline" className="mt-4 w-full gap-2" onClick={() => publishCelebrationMutation.mutate(item.id)} disabled={publishCelebrationMutation.isPending}><Megaphone className="h-3.5 w-3.5" /> Publish to team</Button>}</article> })}</div>}
        </TabsContent>
      </Tabs>

      <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Create a prayer chain</DialogTitle><DialogDescription>The app creates continuous one-hour watches between the selected start and end time.</DialogDescription></DialogHeader><form onSubmit={submitCampaign} className="space-y-4"><div className="space-y-2"><Label htmlFor="prayer-title">Title</Label><Input id="prayer-title" value={campaignForm.title} onChange={(event) => setCampaignForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. WOFBEC overnight prayer chain" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="prayer-kind">Prayer type</Label><Select value={campaignForm.kind} onValueChange={(value) => setCampaignForm((current) => ({ ...current, kind: value }))}><SelectTrigger id="prayer-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prayer_chain">Event prayer chain</SelectItem><SelectItem value="event">Event prayer</SelectItem><SelectItem value="training">Training prayer</SelectItem><SelectItem value="daily_member">Daily member prayer</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Timezone</Label><Input value="Africa/Lagos" disabled /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="prayer-start">Starts</Label><Input id="prayer-start" type="datetime-local" value={campaignForm.starts_at} onChange={(event) => setCampaignForm((current) => ({ ...current, starts_at: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="prayer-end">Ends</Label><Input id="prayer-end" type="datetime-local" value={campaignForm.ends_at} onChange={(event) => setCampaignForm((current) => ({ ...current, ends_at: event.target.value }))} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="prayer-program">Program (optional)</Label><Select value={campaignForm.program_id || "none"} onValueChange={(value) => setCampaignForm((current) => ({ ...current, program_id: value === "none" ? "" : value }))}><SelectTrigger id="prayer-program"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No program</SelectItem>{(programsQuery.data ?? []).map((program) => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="prayer-training">Training (optional)</Label><Select value={campaignForm.training_schedule_id || "none"} onValueChange={(value) => setCampaignForm((current) => ({ ...current, training_schedule_id: value === "none" ? "" : value }))}><SelectTrigger id="prayer-training"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No training</SelectItem>{(schedulesQuery.data ?? []).map((schedule) => <SelectItem key={schedule.id} value={schedule.id}>{schedule.topic}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label htmlFor="prayer-description">Prayer focus</Label><Textarea id="prayer-description" rows={3} value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} placeholder="Focus, scripture, guidance or special instructions" /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCampaignDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createCampaignMutation.isPending}>{createCampaignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create hourly watches</Button></div></form></DialogContent></Dialog>

      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Assign prayer watch</DialogTitle><DialogDescription>{editingSlot && `${formatWatch(editingSlot.start_at)} – ${formatWatch(editingSlot.end_at)}`}</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); if (!slotForm.label.trim()) return toast.error("Add a watch label"); saveSlotMutation.mutate() }} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="watch-label">Label</Label><Input id="watch-label" value={slotForm.label} onChange={(event) => setSlotForm((current) => ({ ...current, label: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="watch-team">Group name</Label><Input id="watch-team" value={slotForm.team_name} onChange={(event) => setSlotForm((current) => ({ ...current, team_name: event.target.value }))} placeholder="e.g. Team A" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="watch-subject">Person being prayed for (optional)</Label><Select value={slotForm.subject_user_id || "none"} onValueChange={(value) => setSlotForm((current) => ({ ...current, subject_user_id: value === "none" ? "" : value }))}><SelectTrigger id="watch-subject"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">General prayer</SelectItem>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email || "Unnamed officer"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="watch-status">Status</Label><Select value={slotForm.status} onValueChange={(value) => setSlotForm((current) => ({ ...current, status: value }))}><SelectTrigger id="watch-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="missed">Missed</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>Prayer team</Label><div className="max-h-56 overflow-y-auto rounded-2xl border border-border p-2"><div className="grid gap-1 sm:grid-cols-2">{officers.map((officer) => { const selected = selectedMemberIds.includes(officer.id); return <button key={officer.id} type="button" onClick={() => setSelectedMemberIds((current) => selected ? current.filter((id) => id !== officer.id) : [...current, officer.id])} className={cn("flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors", selected ? "bg-rose-500/10 text-foreground" : "hover:bg-muted")}><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", selected && "border-rose-500 bg-rose-500 text-white")}>{selected && <Check className="h-3.5 w-3.5" />}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{officer.full_name || officer.email}</span>{officer.oscar && <span className="block text-[11px] text-muted-foreground">{officer.oscar}</span>}</span></button> })}</div></div></div><div className="space-y-2"><Label htmlFor="watch-notes">Instructions</Label><Textarea id="watch-notes" rows={2} value={slotForm.notes} onChange={(event) => setSlotForm((current) => ({ ...current, notes: event.target.value }))} /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSlotDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveSlotMutation.isPending}>{saveSlotMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save assignment</Button></div></form></DialogContent></Dialog>

      <Dialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Create care item</DialogTitle><DialogDescription>Record only the information needed to coordinate support. Emergency contact details are not collected here.</DialogDescription></DialogHeader><form onSubmit={submitCase} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="case-type">Type</Label><Select value={caseForm.case_type} onValueChange={(value: WelfareCase["case_type"]) => setCaseForm((current) => ({ ...current, case_type: value }))}><SelectTrigger id="case-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CASE_TYPES).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="case-privacy">Visibility</Label><Select value={caseForm.privacy} onValueChange={(value) => setCaseForm((current) => ({ ...current, privacy: value }))}><SelectTrigger id="case-privacy"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="welfare_only">Welfare team only</SelectItem><SelectItem value="assigned">Assigned officers only</SelectItem><SelectItem value="team">Member&apos;s team</SelectItem><SelectItem value="all_members">All members</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label htmlFor="case-title">Title</Label><Input id="case-title" value={caseForm.title} onChange={(event) => setCaseForm((current) => ({ ...current, title: event.target.value }))} placeholder="A concise, respectful description" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="case-member">Member (optional)</Label><Select value={caseForm.target_user_id || "none"} onValueChange={(value) => setCaseForm((current) => ({ ...current, target_user_id: value === "none" ? "" : value }))}><SelectTrigger id="case-member"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">External beneficiary</SelectItem>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="case-beneficiary">Beneficiary name</Label><Input id="case-beneficiary" value={caseForm.beneficiary_name} onChange={(event) => setCaseForm((current) => ({ ...current, beneficiary_name: event.target.value }))} placeholder="If not a TCNP member" /></div></div><div className="space-y-2"><Label htmlFor="case-description">Coordination notes</Label><Textarea id="case-description" rows={3} value={caseForm.description} onChange={(event) => setCaseForm((current) => ({ ...current, description: event.target.value }))} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="case-date">Date and time</Label><Input id="case-date" type="datetime-local" value={caseForm.event_at} onChange={(event) => setCaseForm((current) => ({ ...current, event_at: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="case-owner">Assigned coordinator</Label><Select value={caseForm.assigned_to || "none"} onValueChange={(value) => setCaseForm((current) => ({ ...current, assigned_to: value === "none" ? "" : value }))}><SelectTrigger id="case-owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email}</SelectItem>)}</SelectContent></Select></div></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCaseDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createCaseMutation.isPending}>{createCaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create care item</Button></div></form></DialogContent></Dialog>

      <Dialog open={celebrationDialogOpen} onOpenChange={setCelebrationDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Prepare a team celebration</DialogTitle><DialogDescription>Create a birthday post or marriage announcement for the protocol family.</DialogDescription></DialogHeader><form onSubmit={submitCelebration} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="celebration-type">Type</Label><Select value={celebrationForm.celebration_type} onValueChange={(value: WelfareCelebration["celebration_type"]) => setCelebrationForm((current) => ({ ...current, celebration_type: value }))}><SelectTrigger id="celebration-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="birthday">Birthday</SelectItem><SelectItem value="wedding">Wedding</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="celebration-status">Publish state</Label><Select value={celebrationForm.status} onValueChange={(value) => setCelebrationForm((current) => ({ ...current, status: value }))}><SelectTrigger id="celebration-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Save draft</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="published">Publish now</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="celebration-member">Member (optional)</Label><Select value={celebrationForm.target_user_id || "none"} onValueChange={(value) => setCelebrationForm((current) => ({ ...current, target_user_id: value === "none" ? "" : value }))}><SelectTrigger id="celebration-member"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Enter name manually</SelectItem>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="celebrant-name">Celebrant name</Label><Input id="celebrant-name" value={celebrationForm.celebrant_name} onChange={(event) => setCelebrationForm((current) => ({ ...current, celebrant_name: event.target.value }))} placeholder="If not selected above" /></div></div><div className="space-y-2"><Label htmlFor="celebration-title">Post title</Label><Input id="celebration-title" value={celebrationForm.title} onChange={(event) => setCelebrationForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Celebrating Ada today" /></div><div className="space-y-2"><Label htmlFor="celebration-date">Event date</Label><Input id="celebration-date" type="date" value={celebrationForm.event_date} onChange={(event) => setCelebrationForm((current) => ({ ...current, event_date: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="celebration-message">Message</Label><Textarea id="celebration-message" rows={4} value={celebrationForm.message} onChange={(event) => setCelebrationForm((current) => ({ ...current, message: event.target.value }))} placeholder="Write a warm message for the whole team" /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCelebrationDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createCelebrationMutation.isPending}>{createCelebrationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}Save celebration</Button></div></form></DialogContent></Dialog>
    </section>
  )
}
