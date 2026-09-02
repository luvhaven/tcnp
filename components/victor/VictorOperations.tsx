"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import {
  Armchair,
  BookOpen,
  ClipboardCheck,
  Download,
  FileUp,
  Loader2,
  MapPin,
  Mic2,
  PackageOpen,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const supabase = createClient()
const POST_CODES = ["A", "B", "C", "D", "E", "F"] as const
const PRESENTATION_BUCKET = "papa-presentations"

type Props = {
  canManage: boolean
  currentUserId: string | null
  selectedTheatreId?: string | null
}

type Row = Record<string, any>

type OperationsData = {
  venues: Row[]
  programs: Row[]
  theatres: Row[]
  users: Row[]
  papas: Row[]
  deployments: Row[]
  posts: Row[]
  postAssignments: Row[]
  parties: Row[]
  partyMembers: Row[]
  ministers: Row[]
  accreditations: Row[]
  entourage: Row[]
  assets: Row[]
  batches: Row[]
  movements: Row[]
  victorUnitId: string | null
}

const EMPTY_DATA: OperationsData = {
  venues: [], programs: [], theatres: [], users: [], papas: [], deployments: [], posts: [],
  postAssignments: [], parties: [], partyMembers: [], ministers: [], accreditations: [],
  entourage: [], assets: [], batches: [], movements: [], victorUnitId: null,
}

function fullName(person: Row | undefined) {
  return person?.full_name || person?.name || "Unassigned"
}

function displayDate(value: string | null | undefined) {
  if (!value) return "Time not set"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function asIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(value)
  } catch {
    return `${currency || "NGN"} ${value.toLocaleString()}`
  }
}

function requirementValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return value == null || value === "" ? "Not supplied" : String(value)
}

export default function VictorOperations({ canManage: legacyCanManage, currentUserId, selectedTheatreId }: Props) {
  const db = supabase as any
  const [membershipCanManage, setMembershipCanManage] = useState<boolean | null>(null)
  const [data, setData] = useState<OperationsData>(EMPTY_DATA)
  const [selectedVenueId, setSelectedVenueId] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [partyMemberChoices, setPartyMemberChoices] = useState<Record<string, string>>({})
  const [movementQuantities, setMovementQuantities] = useState<Record<string, string>>({})
  const [entouragePapaId, setEntouragePapaId] = useState("")
  const [assetPapaId, setAssetPapaId] = useState("")
  const [assetFile, setAssetFile] = useState<File | null>(null)
  const [partyForm, setPartyForm] = useState({ papaId: "none", label: "", startsAt: "", endsAt: "", notes: "" })
  const [entourageForm, setEntourageForm] = useState({ category: "associate", title: "", fullName: "", phone: "", email: "", notes: "" })
  const [ministerForm, setMinisterForm] = useState({ existingId: "new", title: "", fullName: "", organization: "", email: "", phone: "", papaId: "none" })
  const [ministerSearch, setMinisterSearch] = useState("")
  const [bookForm, setBookForm] = useState({ papaId: "", title: "", isbn: "", quantity: "", unitPrice: "", currency: "NGN", notes: "" })
  const [showVenueForm, setShowVenueForm] = useState(false)
  const [venueForm, setVenueForm] = useState({ programId: "", theatreId: "", label: "", startsAt: "", endsAt: "" })
  const syncedTheatreRef = useRef<string | null | undefined>(undefined)
  // Once the v4 unit authority RPC responds it is the source of truth. The
  // legacy role is only a staged-rollout fallback while the RPC is unavailable.
  const canManage = membershipCanManage ?? legacyCanManage

  useEffect(() => {
    let active = true
    void db.rpc("can_manage_unit", { unit_slug: "victor" }).then(({ data: allowed, error }: Row) => {
      if (active) setMembershipCanManage(error ? null : allowed === true)
    })
    return () => { active = false }
  }, [db])

  const loadOperations = useCallback(async () => {
    setLoading(true)
    setWarning(null)
    try {
      const [unitsResult, venuesResult, programsResult, theatresResult, usersResult] = await Promise.all([
        db.from("units").select("id,slug").eq("slug", "victor").maybeSingle(),
        db.from("program_venues").select("*").order("starts_at", { ascending: false }),
        db.from("programs").select("id,name,status,theatre_id").order("name"),
        db.from("theatres").select("id,name,city").order("name"),
        db.from("users").select("id,full_name,role,oscar,is_active").eq("is_active", true).order("full_name"),
      ])

      if (venuesResult.error) throw venuesResult.error
      const venues = venuesResult.data ?? []
      const programIds = [...new Set(venues.map((venue: Row) => venue.program_id).filter(Boolean))]

      let papaResult = await db
        .from("papas")
        .select("id,title,full_name,program_id,is_deleted,mic_preference,has_slides,needs_clicker,uses_stage_props,stage_props_details,personal_assistants,entourage_count,special_requirements")
        .eq("is_deleted", false)
        .order("full_name")
      if (papaResult.error && /needs_clicker|stage_props_details/i.test(papaResult.error.message || "")) {
        papaResult = await db
          .from("papas")
          .select("id,title,full_name,program_id,is_deleted,mic_preference,has_slides,uses_stage_props,personal_assistants,entourage_count,special_requirements")
          .eq("is_deleted", false)
          .order("full_name")
      }

      const optionalRequests = [
        db.from("unit_deployments").select("*"),
        db.from("operational_posts").select("*").eq("unit_id", unitsResult.data?.id || "00000000-0000-0000-0000-000000000000"),
        db.from("operational_post_assignments").select("*"),
        db.from("welcome_parties").select("*"),
        db.from("welcome_party_members").select("*"),
        db.from("senior_ministers").select("*").order("full_name"),
        db.from("program_senior_ministers").select("*"),
        db.from("papa_entourage_members").select("*"),
        db.from("presentation_assets").select("*").order("created_at", { ascending: false }),
        db.from("papa_book_batches").select("*").order("created_at", { ascending: false }),
        db.from("papa_book_movements").select("*").order("created_at", { ascending: false }),
      ]
      const optionalResults = await Promise.all(optionalRequests)
      const optionalErrors = optionalResults.map((result: Row) => result.error?.message).filter(Boolean)

      setData({
        venues,
        programs: programsResult.data ?? [],
        theatres: theatresResult.data ?? [],
        users: usersResult.data ?? [],
        papas: (papaResult.data ?? [])
          .filter((papa: Row) => programIds.length === 0 || programIds.includes(papa.program_id))
          .map((papa: Row) => ({ ...papa, personal_assistants: Array.isArray(papa.personal_assistants) ? papa.personal_assistants : [] })),
        deployments: optionalResults[0].data ?? [],
        posts: optionalResults[1].data ?? [],
        postAssignments: optionalResults[2].data ?? [],
        parties: optionalResults[3].data ?? [],
        partyMembers: optionalResults[4].data ?? [],
        ministers: optionalResults[5].data ?? [],
        accreditations: (optionalResults[6].data ?? []).map((record: Row) => ({
          ...record,
          accreditation_status: record.accreditation_status === "declined" ? "revoked" : record.accreditation_status,
          arrival_status: record.arrival_status === "cancelled" ? "no_show" : record.arrival_status,
        })),
        entourage: optionalResults[7].data ?? [],
        assets: optionalResults[8].data ?? [],
        batches: optionalResults[9].data ?? [],
        movements: optionalResults[10].data ?? [],
        victorUnitId: unitsResult.data?.id ?? null,
      })
      if (optionalErrors.length > 0) setWarning("Some operational modules are still being provisioned. Available records remain usable.")
    } catch (error: any) {
      setWarning(error?.message || "Victor operations could not be loaded.")
      setData(EMPTY_DATA)
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => { void loadOperations() }, [loadOperations])

  useEffect(() => {
    if (data.venues.length === 0) return
    const linked = selectedTheatreId ? data.venues.find((venue) => venue.theatre_id === selectedTheatreId) : null
    const externalTheatreChanged = syncedTheatreRef.current !== selectedTheatreId
    if (externalTheatreChanged) syncedTheatreRef.current = selectedTheatreId
    if (externalTheatreChanged && linked && linked.id !== selectedVenueId) {
      setSelectedVenueId(linked.id)
      return
    }
    if (!selectedVenueId || !data.venues.some((venue) => venue.id === selectedVenueId)) setSelectedVenueId(data.venues[0].id)
  }, [data.venues, selectedTheatreId, selectedVenueId])

  const programById = useMemo(() => new Map(data.programs.map((item) => [item.id, item])), [data.programs])
  const theatreById = useMemo(() => new Map(data.theatres.map((item) => [item.id, item])), [data.theatres])
  const userById = useMemo(() => new Map(data.users.map((item) => [item.id, item])), [data.users])
  const papaById = useMemo(() => new Map(data.papas.map((item) => [item.id, item])), [data.papas])
  const ministerById = useMemo(() => new Map(data.ministers.map((item) => [item.id, item])), [data.ministers])
  const selectedVenue = data.venues.find((venue) => venue.id === selectedVenueId)
  const venuePapas = data.papas.filter((papa) => papa.program_id === selectedVenue?.program_id)
  const venuePosts = data.posts.filter((post) => post.program_venue_id === selectedVenueId).sort((a, b) => String(a.code).localeCompare(String(b.code)))
  const deployment = data.deployments.find((item) => item.program_venue_id === selectedVenueId && item.unit_id === data.victorUnitId)
  const venueParties = data.parties.filter((party) => party.program_venue_id === selectedVenueId)
  const venueAccreditations = data.accreditations.filter((item) => item.program_id === selectedVenue?.program_id && (!selectedVenue?.theatre_id || item.theatre_id === selectedVenue.theatre_id))
  const venueAssets = data.assets.filter((item) => item.program_id === selectedVenue?.program_id)
  const venueBatches = data.batches.filter((item) => item.program_id === selectedVenue?.program_id)

  useEffect(() => {
    const first = venuePapas[0]?.id || ""
    if (!venuePapas.some((papa) => papa.id === entouragePapaId)) setEntouragePapaId(first)
    if (!venuePapas.some((papa) => papa.id === assetPapaId)) setAssetPapaId(first)
    if (!venuePapas.some((papa) => papa.id === bookForm.papaId) && bookForm.papaId !== first) setBookForm((current) => ({ ...current, papaId: first }))
  }, [assetPapaId, bookForm.papaId, entouragePapaId, venuePapas])

  const action = async (key: string, success: string, work: () => Promise<void>) => {
    if (!canManage) {
      toast.error("This workspace is read-only for Victor members. A unit head or administrator must make this change.")
      return
    }
    setBusy(key)
    try {
      await work()
      toast.success(success)
      await loadOperations()
    } catch (error: any) {
      toast.error(error?.message || "The operation could not be completed.")
    } finally {
      setBusy(null)
    }
  }

  const initialiseVenue = () => action("initialise", "Victor posts A–F are ready.", async () => {
    if (!selectedVenue || !data.victorUnitId) throw new Error("Select a programme venue before setting up posts.")
    const { error: deploymentError } = await db.from("unit_deployments").upsert({
      program_venue_id: selectedVenue.id,
      unit_id: data.victorUnitId,
      status: "planned",
      readiness: 0,
      lead_user_id: currentUserId,
      created_by: currentUserId,
    }, { onConflict: "program_venue_id,unit_id", ignoreDuplicates: true })
    if (deploymentError) throw deploymentError
    const missing = POST_CODES.filter((code) => !venuePosts.some((post) => post.code === code)).map((code) => ({
      program_venue_id: selectedVenue.id,
      unit_id: data.victorUnitId,
      code,
      label: `Priority Position ${code}`,
      capacity: 1,
      status: "open",
      created_by: currentUserId,
    }))
    if (missing.length > 0) {
      const { error } = await db.from("operational_posts").insert(missing)
      if (error) throw error
    }
  })

  const createProgramVenue = (event: FormEvent) => {
    event.preventDefault()
    void action("venue:new", "Theatre added to the programme workspace.", async () => {
      const theatre = theatreById.get(venueForm.theatreId)
      const label = venueForm.label.trim() || theatre?.name
      if (!venueForm.programId || !venueForm.theatreId || !label) throw new Error("Choose a programme and theatre.")
      const { error } = await db.from("program_venues").insert({
        program_id: venueForm.programId,
        theatre_id: venueForm.theatreId,
        label,
        timezone: "Africa/Lagos",
        starts_at: asIso(venueForm.startsAt),
        ends_at: asIso(venueForm.endsAt),
        status: "planned",
        is_primary: false,
        created_by: currentUserId,
      })
      if (error) throw error
      setShowVenueForm(false)
      setVenueForm({ programId: "", theatreId: "", label: "", startsAt: "", endsAt: "" })
    })
  }

  const assignPost = (post: Row, userId: string) => action(`post:${post.id}`, userId === "unassigned" ? `Position ${post.code} cleared.` : `Position ${post.code} reassigned.`, async () => {
    const existing = data.postAssignments.filter((item) => item.post_id === post.id)
    const { error: deleteError } = await db.from("operational_post_assignments").delete().eq("post_id", post.id)
    if (deleteError) throw deleteError
    if (userId !== "unassigned") {
      const { error } = await db.from("operational_post_assignments").insert({ post_id: post.id, user_id: userId, assignment_role: "primary", assigned_by: currentUserId })
      if (error) {
        if (existing.length > 0) await db.from("operational_post_assignments").insert(existing.map(({ post_id, user_id, assignment_role }: Row) => ({ post_id, user_id, assignment_role, assigned_by: currentUserId })))
        throw error
      }
    }
  })

  const updateDeployment = (patch: Row) => action("deployment", "Venue readiness updated.", async () => {
    if (!deployment) throw new Error("Set up Victor operations for this venue first.")
    const { error } = await db.from("unit_deployments").update(patch).eq("id", deployment.id)
    if (error) throw error
  })

  const createParty = (event: FormEvent) => {
    event.preventDefault()
    void action("party:new", "Welcome party created.", async () => {
      if (!selectedVenue || !partyForm.label.trim() || !partyForm.startsAt) throw new Error("A welcome-party label and start time are required.")
      const { error } = await db.from("welcome_parties").insert({
        program_venue_id: selectedVenue.id,
        papa_id: partyForm.papaId === "none" ? null : partyForm.papaId,
        label: partyForm.label.trim(),
        scheduled_start: asIso(partyForm.startsAt),
        scheduled_end: asIso(partyForm.endsAt),
        status: "planned",
        notes: partyForm.notes.trim() || null,
        created_by: currentUserId,
      })
      if (error) throw error
      setPartyForm({ papaId: "none", label: "", startsAt: "", endsAt: "", notes: "" })
    })
  }

  const addPartyMember = (party: Row) => {
    const userId = partyMemberChoices[party.id]
    if (!userId) return toast.error("Choose an officer first.")
    void action(`party-member:${party.id}`, "Welcome-party member added.", async () => {
      const { error } = await db.from("welcome_party_members").upsert({ party_id: party.id, user_id: userId, role: "member", assigned_by: currentUserId }, { onConflict: "party_id,user_id" })
      if (error) throw error
      setPartyMemberChoices((current) => ({ ...current, [party.id]: "" }))
    })
  }

  const removePartyMember = (partyId: string, userId: string) => action(`party-member:${partyId}:${userId}`, "Welcome-party member removed.", async () => {
    const { error } = await db.from("welcome_party_members").delete().eq("party_id", partyId).eq("user_id", userId)
    if (error) throw error
  })

  const createEntourageMember = (event: FormEvent) => {
    event.preventDefault()
    void action("entourage:new", "Entourage member added to the Papa dossier.", async () => {
      if (!entouragePapaId || !entourageForm.fullName.trim()) throw new Error("Choose a Papa and enter the member's name.")
      const { error } = await db.from("papa_entourage_members").insert({
        papa_id: entouragePapaId,
        category: entourageForm.category,
        title: entourageForm.title.trim() || null,
        full_name: entourageForm.fullName.trim(),
        phone: entourageForm.phone.trim() || null,
        email: entourageForm.email.trim() || null,
        notes: entourageForm.notes.trim() || null,
        created_by: currentUserId,
      })
      if (error) throw error
      setEntourageForm({ category: "associate", title: "", fullName: "", phone: "", email: "", notes: "" })
    })
  }

  const addMinister = (event: FormEvent) => {
    event.preventDefault()
    void action("minister:new", "Senior minister accredited for this programme.", async () => {
      if (!selectedVenue) throw new Error("Choose a programme venue.")
      let ministerId = ministerForm.existingId
      if (ministerId === "new") {
        if (!ministerForm.fullName.trim()) throw new Error("Enter the senior minister's name.")
        const { data: created, error } = await db.from("senior_ministers").insert({
          title: ministerForm.title.trim() || null,
          full_name: ministerForm.fullName.trim(),
          organization: ministerForm.organization.trim() || null,
          email: ministerForm.email.trim() || null,
          phone: ministerForm.phone.trim() || null,
          created_by: currentUserId,
        }).select("id").single()
        if (error) throw error
        ministerId = created.id
      }
      const { error } = await db.from("program_senior_ministers").insert({
        senior_minister_id: ministerId,
        program_id: selectedVenue.program_id,
        theatre_id: selectedVenue.theatre_id,
        papa_id: ministerForm.papaId === "none" ? null : ministerForm.papaId,
        accreditation_status: "pending",
        arrival_status: "expected",
        added_by: currentUserId,
      })
      if (error) throw error
      setMinisterForm({ existingId: "new", title: "", fullName: "", organization: "", email: "", phone: "", papaId: "none" })
    })
  }

  const updateAccreditation = (record: Row, patch: Row) => action(`accreditation:${record.senior_minister_id}`, "Accreditation updated.", async () => {
    const safePatch = {
      ...patch,
      ...(patch.accreditation_status === "revoked" ? { accreditation_status: "declined" } : {}),
      ...(patch.arrival_status === "no_show" ? { arrival_status: "cancelled" } : {}),
    }
    let request = db.from("program_senior_ministers").update(safePatch)
      .eq("senior_minister_id", record.senior_minister_id)
      .eq("program_id", record.program_id)
    request = record.theatre_id ? request.eq("theatre_id", record.theatre_id) : request.is("theatre_id", null)
    const { error } = await request
    if (error) throw error
  })

  const uploadPresentation = (event: FormEvent) => {
    event.preventDefault()
    void action("asset:upload", "Presentation uploaded securely.", async () => {
      if (!selectedVenue || !assetPapaId || !assetFile || !currentUserId) throw new Error("Choose a Papa and a presentation file after your profile has loaded.")
      if (assetFile.size > 25 * 1024 * 1024) throw new Error("Presentation files must be 25 MB or smaller.")
      const extension = assetFile.name.split(".").pop()?.toLowerCase()
      if (!extension || !["pdf", "ppt", "pptx"].includes(extension)) throw new Error("Upload a PDF, PPT, or PPTX presentation.")
      const safeName = assetFile.name.replace(/[^a-zA-Z0-9._-]/g, "-")
      // Papa id is deliberately the first path segment. Storage RLS uses it to
      // let the Papa's assigned DO upload while keeping the bucket private.
      const path = `${assetPapaId}/${selectedVenue.program_id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from(PRESENTATION_BUCKET).upload(path, assetFile, { contentType: assetFile.type || undefined })
      if (uploadError) throw uploadError
      const { error: recordError } = await db.from("presentation_assets").insert({
        papa_id: assetPapaId,
        program_id: selectedVenue.program_id,
        title: assetFile.name.replace(/\.[^.]+$/, ""),
        storage_path: path,
        original_name: assetFile.name,
        mime_type: assetFile.type || null,
        file_size: assetFile.size,
        uploaded_by: currentUserId,
      })
      if (recordError) {
        await supabase.storage.from(PRESENTATION_BUCKET).remove([path])
        throw recordError
      }
      setAssetFile(null)
    })
  }

  const downloadPresentation = async (asset: Row) => {
    setBusy(`asset:${asset.id}`)
    try {
      const { data: signed, error } = await supabase.storage.from(PRESENTATION_BUCKET).createSignedUrl(asset.storage_path, 300, { download: asset.original_name || true })
      if (error) throw error
      window.open(signed.signedUrl, "_blank", "noopener,noreferrer")
    } catch (error: any) {
      toast.error(error?.message || "A secure download link could not be created.")
    } finally {
      setBusy(null)
    }
  }

  const createBookBatch = (event: FormEvent) => {
    event.preventDefault()
    void action("book:new", "Book consignment recorded.", async () => {
      const quantity = Number(bookForm.quantity)
      const unitPrice = Number(bookForm.unitPrice)
      if (!selectedVenue || !bookForm.papaId || !bookForm.title.trim() || !Number.isInteger(quantity) || quantity <= 0 || unitPrice < 0) {
        throw new Error("Choose a Papa and provide a title, positive whole quantity, and valid unit price.")
      }
      const { error } = await db.from("papa_book_batches").insert({
        papa_id: bookForm.papaId,
        program_id: selectedVenue.program_id,
        title: bookForm.title.trim(),
        isbn: bookForm.isbn.trim() || null,
        quantity_received: quantity,
        unit_price: unitPrice,
        currency: bookForm.currency.trim().toUpperCase() || "NGN",
        notes: bookForm.notes.trim() || null,
        created_by: currentUserId,
      })
      if (error) throw error
      setBookForm((current) => ({ ...current, title: "", isbn: "", quantity: "", unitPrice: "", notes: "" }))
    })
  }

  const bookTotals = (batch: Row) => {
    const rows = data.movements.filter((movement) => movement.batch_id === batch.id)
    const sales = rows.filter((movement) => movement.movement_type === "sale")
    const returnedToPapa = rows.filter((movement) => ["return", "return_to_papa"].includes(movement.movement_type)).reduce((sum, movement) => sum + Number(movement.quantity || 0), 0)
    const adjustments = rows.filter((movement) => movement.movement_type === "adjustment").reduce((sum, movement) => sum + Number(movement.quantity || 0), 0)
    const sold = Math.max(0, sales.reduce((sum, movement) => sum + Number(movement.quantity || 0), 0))
    const payout = Math.max(0, sales.reduce((sum, movement) => sum + Number(movement.amount ?? (Number(movement.quantity || 0) * Number(batch.unit_price || 0))), 0))
    return { sold, returnedToPapa, remaining: Math.max(0, Number(batch.quantity_received || 0) + adjustments - sold - returnedToPapa), payout }
  }

  const recordBookMovement = (batch: Row, movementType: "sale" | "return" | "return_to_papa") => action(`movement:${batch.id}`, movementType === "sale" ? "Book sale recorded." : "Unsold copies returned to the Papa.", async () => {
    const quantity = Number(movementQuantities[batch.id])
    const totals = bookTotals(batch)
    const normalizedType = movementType === "return" ? "return_to_papa" : movementType
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Enter a positive whole quantity.")
    if (movementType === "sale" && quantity > totals.remaining) throw new Error("The sale quantity is greater than the remaining stock.")
    if (normalizedType === "return_to_papa" && quantity > totals.remaining) throw new Error("The return quantity is greater than the remaining stock.")
    const { error } = await db.from("papa_book_movements").insert({
      batch_id: batch.id,
      movement_type: normalizedType,
      quantity,
      amount: normalizedType === "sale" ? quantity * Number(batch.unit_price || 0) : 0,
      notes: normalizedType === "sale" ? "Victor sale" : "Unsold stock returned to Papa",
      created_by: currentUserId,
    })
    if (error) throw error
    setMovementQuantities((current) => ({ ...current, [batch.id]: "" }))
  })

  const filteredMinisters = data.ministers.filter((minister) => {
    const needle = ministerSearch.trim().toLowerCase()
    return !needle || [minister.full_name, minister.title, minister.organization].filter(Boolean).join(" ").toLowerCase().includes(needle)
  })

  if (loading && data.venues.length === 0) {
    return <Card><CardContent className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-rose-500" /><span className="ml-2 text-sm text-muted-foreground">Loading Victor operations…</span></CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-rose-500/20">
        <CardHeader className="border-b bg-gradient-to-br from-rose-500/10 via-background to-amber-500/5 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><ShieldCheck className="h-5 w-5" /></div>
                <div><CardTitle className="text-lg">Victor Operations Desk</CardTitle><CardDescription className="mt-0.5 text-xs">One live workspace for every theatre, Papa party, priority post, presentation, and book consignment.</CardDescription></div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                <SelectTrigger className="h-9 min-w-0 bg-background text-xs sm:w-[22rem]"><SelectValue placeholder="Select a programme venue" /></SelectTrigger>
                <SelectContent>
                  {data.venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>{venue.label} · {programById.get(venue.program_id)?.name || "Programme"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => void loadOperations()} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Refresh</Button>
              {canManage && (
                <Button type="button" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setShowVenueForm((value) => !value)}>
                  <Plus className="h-3.5 w-3.5" />Add theatre
                </Button>
              )}
            </div>
          </div>
          {selectedVenue && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="outline" className="gap-1 bg-background"><MapPin className="h-3 w-3" />{theatreById.get(selectedVenue.theatre_id)?.name || selectedVenue.label}</Badge>
              <Badge variant="outline" className="bg-background">{programById.get(selectedVenue.program_id)?.name || "Programme"}</Badge>
              <Badge variant="outline" className="bg-background">{selectedVenue.status || "planned"}</Badge>
              {!canManage && <Badge variant="secondary">Read-only member view</Badge>}
            </div>
          )}
        </CardHeader>
        {canManage && showVenueForm && (
          <form onSubmit={createProgramVenue} className="grid gap-2 border-b bg-muted/10 p-4 md:grid-cols-3">
            <Select value={venueForm.programId} onValueChange={(value) => setVenueForm({ ...venueForm, programId: value })}>
              <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="Programme" /></SelectTrigger>
              <SelectContent>{data.programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={venueForm.theatreId} onValueChange={(value) => setVenueForm({ ...venueForm, theatreId: value })}>
              <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="Theatre" /></SelectTrigger>
              <SelectContent>{data.theatres.map((theatre) => <SelectItem key={theatre.id} value={theatre.id}>{theatre.name}{theatre.city ? ` · ${theatre.city}` : ""}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={venueForm.label} onChange={(event) => setVenueForm({ ...venueForm, label: event.target.value })} placeholder="Display label (optional)" className="h-9 bg-background text-xs" />
            <Input type="datetime-local" value={venueForm.startsAt} onChange={(event) => setVenueForm({ ...venueForm, startsAt: event.target.value })} className="h-9 bg-background text-xs" />
            <Input type="datetime-local" value={venueForm.endsAt} onChange={(event) => setVenueForm({ ...venueForm, endsAt: event.target.value })} className="h-9 bg-background text-xs" />
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-9 flex-1 text-xs" onClick={() => setShowVenueForm(false)}>Cancel</Button>
              <Button size="sm" className="h-9 flex-1 text-xs" disabled={busy === "venue:new"}>{busy === "venue:new" ? "Adding…" : "Add theatre"}</Button>
            </div>
          </form>
        )}
        {warning && <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">{warning}</div>}
      </Card>

      {data.venues.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Multi-theatre Victor readiness">
          {data.venues.map((venue) => {
            const venueDeployment = data.deployments.find((item) => item.program_venue_id === venue.id && item.unit_id === data.victorUnitId)
            const active = venue.id === selectedVenueId
            return (
              <button
                key={venue.id}
                type="button"
                onClick={() => setSelectedVenueId(venue.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-rose-500/40 bg-rose-500/5" : "bg-card hover:border-rose-500/25 hover:bg-muted/20"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{venue.label}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{programById.get(venue.program_id)?.name || "Programme"}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[9px]">{venueDeployment?.status || "not set"}</Badge>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${venueDeployment?.readiness || 0}%` }} />
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">{venueDeployment?.readiness || 0}% ready</p>
              </button>
            )
          })}
        </div>
      )}

      {data.venues.length === 0 ? (
        <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><MapPin className="h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-semibold">No programme venues yet</p><p className="mt-1 max-w-md text-xs text-muted-foreground">Link a programme to one or more theatres to activate Victor&apos;s multi-venue supervision workspace.</p></CardContent></Card>
      ) : (
        <Tabs defaultValue="positions" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-4">
            <TabsTrigger value="positions" className="gap-1.5 text-xs"><Armchair className="h-3.5 w-3.5" />Posts A–F</TabsTrigger>
            <TabsTrigger value="welcome" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Welcome & entourage</TabsTrigger>
            <TabsTrigger value="ministry" className="gap-1.5 text-xs"><Presentation className="h-3.5 w-3.5" />Guests & slides</TabsTrigger>
            <TabsTrigger value="books" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" />Book desk</TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="text-base">Priority positions A–F</CardTitle><CardDescription className="text-xs">Assign or reassign any active protocol officer at this theatre.</CardDescription></div>{canManage && venuePosts.length < 6 && <Button size="sm" className="gap-1.5 text-xs" onClick={initialiseVenue} disabled={busy === "initialise"}>{busy === "initialise" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Set up A–F</Button>}</CardHeader>
                <CardContent>
                  {venuePosts.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">Priority positions have not been set up for this venue.</div> : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {venuePosts.map((post) => {
                        const assignment = data.postAssignments.find((item) => item.post_id === post.id)
                        return <div key={post.id} className="rounded-xl border bg-muted/10 p-3"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-sm font-black text-rose-600">{post.code}</span><Badge variant="outline" className="text-[9px]">{post.status || "planned"}</Badge></div><p className="mt-2 text-xs font-semibold">{post.label}</p><Select value={assignment?.user_id || "unassigned"} onValueChange={(value) => assignPost(post, value)} disabled={!canManage || busy === `post:${post.id}`}><SelectTrigger className="mt-3 h-8 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{data.users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name || "Unnamed officer"}</SelectItem>)}</SelectContent></Select></div>
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Venue readiness</CardTitle><CardDescription className="text-xs">Shared unit status for head-level supervision.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  {deployment ? <><div><div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-muted-foreground">Readiness</span><strong>{deployment.readiness || 0}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${deployment.readiness || 0}%` }} /></div></div><div className="space-y-1.5"><Label className="text-xs">Operational status</Label><Select value={deployment.status || "planned"} onValueChange={(value) => updateDeployment({ status: value })} disabled={!canManage || busy === "deployment"}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["planned", "briefing", "ready", "live", "complete", "blocked"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>{canManage && <div className="grid grid-cols-3 gap-1.5">{[25, 75, 100].map((value) => <Button key={value} type="button" size="sm" variant="outline" className="text-[10px]" onClick={() => updateDeployment({ readiness: value })}>{value}%</Button>)}</div>}</> : <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Set up A–F to create the venue deployment.</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="welcome" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
              <Card><CardHeader><CardTitle className="text-base">Welcome parties</CardTitle><CardDescription className="text-xs">Build teams around a specific Papa or arrival time.</CardDescription></CardHeader><CardContent className="space-y-3">
                {canManage && <form onSubmit={createParty} className="grid gap-2 rounded-xl border bg-muted/10 p-3 sm:grid-cols-2"><Input required value={partyForm.label} onChange={(e) => setPartyForm({ ...partyForm, label: e.target.value })} placeholder="Party label, e.g. Evening welcome" className="h-9 text-xs" /><Select value={partyForm.papaId} onValueChange={(value) => setPartyForm({ ...partyForm, papaId: value })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Time-based / all guests</SelectItem>{venuePapas.map((papa) => <SelectItem key={papa.id} value={papa.id}>{fullName(papa)}</SelectItem>)}</SelectContent></Select><Input type="datetime-local" value={partyForm.startsAt} onChange={(e) => setPartyForm({ ...partyForm, startsAt: e.target.value })} className="h-9 text-xs" /><Input type="datetime-local" value={partyForm.endsAt} onChange={(e) => setPartyForm({ ...partyForm, endsAt: e.target.value })} className="h-9 text-xs" /><Textarea value={partyForm.notes} onChange={(e) => setPartyForm({ ...partyForm, notes: e.target.value })} placeholder="Welcome notes" className="min-h-16 text-xs sm:col-span-2" /><Button size="sm" className="gap-1.5 text-xs sm:col-span-2" disabled={busy === "party:new"}><Plus className="h-3.5 w-3.5" />Create welcome party</Button></form>}
                {venueParties.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">No welcome parties are scheduled.</div> : venueParties.map((party) => { const members = data.partyMembers.filter((member) => member.party_id === party.id); return <div key={party.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{party.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{papaById.get(party.papa_id)?.full_name || "All arrivals"} · {displayDate(party.scheduled_start)}</p></div><Badge variant="secondary" className="text-[9px]">{party.status}</Badge></div><div className="mt-3 flex flex-wrap gap-1.5">{members.length === 0 && <span className="text-[11px] text-muted-foreground">No members assigned</span>}{members.map((member) => <Badge key={member.user_id} variant="outline" className="gap-1 text-[10px]">{fullName(userById.get(member.user_id))}{canManage && <button type="button" aria-label={`Remove ${fullName(userById.get(member.user_id))}`} onClick={() => void removePartyMember(party.id, member.user_id)}><Trash2 className="h-3 w-3 text-destructive" /></button>}</Badge>)}</div>{canManage && <div className="mt-3 flex gap-2"><Select value={partyMemberChoices[party.id] || ""} onValueChange={(value) => setPartyMemberChoices((current) => ({ ...current, [party.id]: value }))}><SelectTrigger className="h-8 flex-1 text-[11px]"><SelectValue placeholder="Choose officer" /></SelectTrigger><SelectContent>{data.users.filter((user) => !members.some((member) => member.user_id === user.id)).map((user) => <SelectItem key={user.id} value={user.id}>{fullName(user)}</SelectItem>)}</SelectContent></Select><Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-[10px]" onClick={() => addPartyMember(party)}><UserPlus className="h-3 w-3" />Add</Button></div>}</div> })}
              </CardContent></Card>

              <Card><CardHeader><CardTitle className="text-base">Named entourage</CardTitle><CardDescription className="text-xs">Senior ministers, associates, PAs, family, and other guests from each Papa dossier.</CardDescription></CardHeader><CardContent className="space-y-3"><Select value={entouragePapaId} onValueChange={setEntouragePapaId}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Choose Papa" /></SelectTrigger><SelectContent>{venuePapas.map((papa) => <SelectItem key={papa.id} value={papa.id}>{fullName(papa)}</SelectItem>)}</SelectContent></Select>{entouragePapaId && <div className="space-y-2">{((papaById.get(entouragePapaId)?.personal_assistants as Row[]) || []).map((assistant, index) => <div key={`pa-${index}`} className="rounded-lg border bg-muted/10 p-2.5"><div className="flex items-center justify-between"><p className="text-xs font-semibold">{assistant.name || "Unnamed PA"}</p><Badge variant="secondary" className="text-[9px]">PA form</Badge></div><p className="text-[10px] text-muted-foreground">{assistant.role || "Personal assistant"}{assistant.phone ? ` · ${assistant.phone}` : ""}</p></div>)}{data.entourage.filter((member) => member.papa_id === entouragePapaId).map((member) => <div key={member.id} className="rounded-lg border p-2.5"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{member.title ? `${member.title} ` : ""}{member.full_name}</p><Badge variant="outline" className="text-[9px]">{member.category}</Badge></div><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{member.phone || member.email || member.notes || "No contact detail"}</p></div>)}</div>}{canManage && entouragePapaId && <form onSubmit={createEntourageMember} className="space-y-2 border-t pt-3"><div className="grid grid-cols-2 gap-2"><Select value={entourageForm.category} onValueChange={(value) => setEntourageForm({ ...entourageForm, category: value })}><SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{["senior_minister", "associate", "personal_assistant", "family", "entourage"].map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select><Input value={entourageForm.title} onChange={(e) => setEntourageForm({ ...entourageForm, title: e.target.value })} placeholder="Title" className="h-8 text-[11px]" /></div><Input required value={entourageForm.fullName} onChange={(e) => setEntourageForm({ ...entourageForm, fullName: e.target.value })} placeholder="Full name" className="h-8 text-[11px]" /><div className="grid grid-cols-2 gap-2"><Input value={entourageForm.phone} onChange={(e) => setEntourageForm({ ...entourageForm, phone: e.target.value })} placeholder="Phone" className="h-8 text-[11px]" /><Input type="email" value={entourageForm.email} onChange={(e) => setEntourageForm({ ...entourageForm, email: e.target.value })} placeholder="Email" className="h-8 text-[11px]" /></div><Button size="sm" variant="outline" className="w-full gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add named guest</Button></form>}</CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="ministry" className="space-y-4">
            <Card><CardHeader><CardTitle className="text-base">Papa stage & presentation brief</CardTitle><CardDescription className="text-xs">Victor-visible requirements from the Papa form, with secure presentation downloads.</CardDescription></CardHeader><CardContent><div className="grid gap-3 lg:grid-cols-2">{venuePapas.map((papa) => { const assets = venueAssets.filter((asset) => asset.papa_id === papa.id); return <div key={papa.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{papa.title ? `${papa.title} ` : ""}{papa.full_name}</p><p className="text-[10px] text-muted-foreground">{Number(papa.entourage_count || 0)} expected in entourage</p></div><Badge variant={papa.has_slides ? "default" : "secondary"} className="text-[9px]">{papa.has_slides ? "Slides expected" : "No slides"}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-muted/50 p-2"><Mic2 className="mb-1 h-3.5 w-3.5" /><span className="text-muted-foreground">Microphone</span><p className="mt-0.5 font-medium">{requirementValue(papa.mic_preference)}</p></div><div className="rounded-lg bg-muted/50 p-2"><ClipboardCheck className="mb-1 h-3.5 w-3.5" /><span className="text-muted-foreground">Clicker</span><p className="mt-0.5 font-medium">{requirementValue(papa.needs_clicker)}</p></div><div className="col-span-2 rounded-lg bg-muted/50 p-2"><PackageOpen className="mb-1 h-3.5 w-3.5" /><span className="text-muted-foreground">Stage props</span><p className="mt-0.5 font-medium">{papa.uses_stage_props ? requirementValue(papa.stage_props_details || "Required — details not supplied") : "None requested"}</p></div></div>{assets.length > 0 && <div className="mt-3 space-y-1.5">{assets.map((asset) => <button key={asset.id} type="button" onClick={() => void downloadPresentation(asset)} className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] hover:bg-muted/40"><span className="min-w-0 truncate"><Presentation className="mr-1.5 inline h-3.5 w-3.5" />{asset.title || asset.original_name}</span>{busy === `asset:${asset.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}</button>)}</div>}</div>})}{venuePapas.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground lg:col-span-2">No Papas are assigned to this programme.</div>}</div>{canManage && venuePapas.length > 0 && <form onSubmit={uploadPresentation} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[14rem_minmax(0,1fr)_auto]"><Select value={assetPapaId} onValueChange={setAssetPapaId}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{venuePapas.map((papa) => <SelectItem key={papa.id} value={papa.id}>{fullName(papa)}</SelectItem>)}</SelectContent></Select><Input type="file" accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event: ChangeEvent<HTMLInputElement>) => setAssetFile(event.target.files?.[0] || null)} className="h-9 text-xs" /><Button size="sm" className="h-9 gap-1.5 text-xs" disabled={!assetFile || busy === "asset:upload"}><FileUp className="h-3.5 w-3.5" />Secure upload</Button></form>}</CardContent></Card>

            <Card><CardHeader><CardTitle className="text-base">Reusable senior-minister accreditation</CardTitle><CardDescription className="text-xs">Search the master database, add a known minister to this programme, and track badge, seat, arrival, and accreditation state.</CardDescription></CardHeader><CardContent className="space-y-4">{canManage && <form onSubmit={addMinister} className="grid gap-2 rounded-xl border bg-muted/10 p-3 md:grid-cols-3"><Select value={ministerForm.existingId} onValueChange={(value) => setMinisterForm({ ...ministerForm, existingId: value })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Create new database record</SelectItem>{data.ministers.map((minister) => <SelectItem key={minister.id} value={minister.id}>{minister.full_name}{minister.organization ? ` · ${minister.organization}` : ""}</SelectItem>)}</SelectContent></Select><Select value={ministerForm.papaId} onValueChange={(value) => setMinisterForm({ ...ministerForm, papaId: value })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not linked to a Papa</SelectItem>{venuePapas.map((papa) => <SelectItem key={papa.id} value={papa.id}>Guest of {papa.full_name}</SelectItem>)}</SelectContent></Select><Button size="sm" className="h-9 gap-1.5 text-xs"><UserPlus className="h-3.5 w-3.5" />Add to programme</Button>{ministerForm.existingId === "new" && <><Input required value={ministerForm.fullName} onChange={(e) => setMinisterForm({ ...ministerForm, fullName: e.target.value })} placeholder="Full name" className="h-9 text-xs" /><Input value={ministerForm.title} onChange={(e) => setMinisterForm({ ...ministerForm, title: e.target.value })} placeholder="Title" className="h-9 text-xs" /><Input value={ministerForm.organization} onChange={(e) => setMinisterForm({ ...ministerForm, organization: e.target.value })} placeholder="Organisation" className="h-9 text-xs" /><Input type="email" value={ministerForm.email} onChange={(e) => setMinisterForm({ ...ministerForm, email: e.target.value })} placeholder="Email" className="h-9 text-xs" /><Input value={ministerForm.phone} onChange={(e) => setMinisterForm({ ...ministerForm, phone: e.target.value })} placeholder="Phone" className="h-9 text-xs" /></>}</form>}<div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={ministerSearch} onChange={(e) => setMinisterSearch(e.target.value)} placeholder="Search senior-minister database" className="h-9 pl-9 text-xs" /></div><div className="grid gap-2 lg:grid-cols-2">{venueAccreditations.filter((record) => filteredMinisters.some((minister) => minister.id === record.senior_minister_id)).map((record) => { const minister = ministerById.get(record.senior_minister_id); return <div key={`${record.senior_minister_id}:${record.program_id}:${record.theatre_id || "all"}`} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{minister?.title ? `${minister.title} ` : ""}{minister?.full_name || "Senior minister"}</p><p className="text-[10px] text-muted-foreground">{minister?.organization || "Organisation not supplied"}</p></div><Badge variant="outline" className="text-[9px]">{record.accreditation_status || "pending"}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2"><Select value={record.accreditation_status || "pending"} onValueChange={(value) => updateAccreditation(record, { accreditation_status: value })} disabled={!canManage}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger><SelectContent>{["pending", "approved", "printed", "issued", "revoked"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={record.arrival_status || "expected"} onValueChange={(value) => updateAccreditation(record, { arrival_status: value })} disabled={!canManage}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger><SelectContent>{["expected", "arrived", "seated", "departed", "no_show"].map((value) => <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>)}</SelectContent></Select><Input defaultValue={record.badge_number || ""} placeholder="Badge number" className="h-8 text-[10px]" disabled={!canManage} onBlur={(event) => event.target.value !== (record.badge_number || "") && updateAccreditation(record, { badge_number: event.target.value || null })} /><Input defaultValue={record.seat_label || ""} placeholder="Seat label" className="h-8 text-[10px]" disabled={!canManage} onBlur={(event) => event.target.value !== (record.seat_label || "") && updateAccreditation(record, { seat_label: event.target.value || null })} /></div></div>})}{venueAccreditations.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground lg:col-span-2">No senior ministers are accredited for this theatre yet.</div>}</div></CardContent></Card>
          </TabsContent>

          <TabsContent value="books" className="space-y-4">
            <Card><CardHeader><CardTitle className="text-base">Papa book consignments</CardTitle><CardDescription className="text-xs">Stock, sales, returns, remaining copies, and the Papa&apos;s 100% payout are derived from an immutable movement ledger.</CardDescription></CardHeader><CardContent className="space-y-4">{canManage && <form onSubmit={createBookBatch} className="grid gap-2 rounded-xl border bg-muted/10 p-3 md:grid-cols-3"><Select value={bookForm.papaId} onValueChange={(value) => setBookForm({ ...bookForm, papaId: value })}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Papa" /></SelectTrigger><SelectContent>{venuePapas.map((papa) => <SelectItem key={papa.id} value={papa.id}>{fullName(papa)}</SelectItem>)}</SelectContent></Select><Input required value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} placeholder="Book title" className="h-9 text-xs" /><Input value={bookForm.isbn} onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })} placeholder="ISBN (optional)" className="h-9 text-xs" /><Input required type="number" min="1" step="1" value={bookForm.quantity} onChange={(e) => setBookForm({ ...bookForm, quantity: e.target.value })} placeholder="Quantity received" className="h-9 text-xs" /><div className="grid grid-cols-[1fr_5rem] gap-2"><Input required type="number" min="0" step="0.01" value={bookForm.unitPrice} onChange={(e) => setBookForm({ ...bookForm, unitPrice: e.target.value })} placeholder="Unit price" className="h-9 text-xs" /><Input value={bookForm.currency} maxLength={3} onChange={(e) => setBookForm({ ...bookForm, currency: e.target.value })} className="h-9 text-xs uppercase" /></div><Button size="sm" className="h-9 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Record consignment</Button></form>}<div className="grid gap-3 lg:grid-cols-2">{venueBatches.map((batch) => { const totals = bookTotals(batch); return <div key={batch.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{batch.title}</p><p className="text-[10px] text-muted-foreground">For {papaById.get(batch.papa_id)?.full_name || "Papa"} · {money(Number(batch.unit_price || 0), batch.currency)}</p></div><Badge variant="outline" className="text-[9px]">{Number(batch.quantity_received || 0)} received</Badge></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-muted/50 p-2"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sold</p><p className="mt-1 text-lg font-bold">{totals.sold}</p></div><div className="rounded-lg bg-muted/50 p-2"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Remaining</p><p className="mt-1 text-lg font-bold">{totals.remaining}</p></div><div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">100% payout</p><p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">{money(totals.payout, batch.currency)}</p></div></div>{canManage && <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2"><Input type="number" min="1" step="1" value={movementQuantities[batch.id] || ""} onChange={(e) => setMovementQuantities((current) => ({ ...current, [batch.id]: e.target.value }))} placeholder="Copies" className="h-8 text-[11px]" /><Button type="button" size="sm" className="h-8 text-[10px]" onClick={() => recordBookMovement(batch, "sale")}>Record sale</Button><Button type="button" size="sm" variant="outline" className="h-8 text-[10px]" onClick={() => recordBookMovement(batch, "return")}>Return</Button></div>}</div>})}{venueBatches.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground lg:col-span-2"><BookOpen className="mx-auto mb-2 h-7 w-7 opacity-30" />No book consignments recorded for this programme.</div>}</div></CardContent></Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
