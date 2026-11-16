"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { cn, normalizeOscarLabel } from "@/lib/utils"
import { computeProfileCompletion, requiresProtocolTeam, type ProfileFields } from "@/lib/profile-completion"
import { LocationSharingControl } from "@/components/tracking/LocationSharingControl"
import { DeviceNotificationControl } from "@/components/notifications/DeviceNotificationControl"
import { CompletionRing } from "@/components/profile/CompletionRing"
import { useCelebrate } from "@/components/providers/CelebrateProvider"
import { HeadshotCropDialog } from "@/components/profile/HeadshotCropDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ErrorState } from "@/components/ui/error-state"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Camera, Loader2, CheckCircle2, Circle, ShieldCheck, KeyRound, User, Phone,
  Mail, MapPin, Cake, Briefcase, Sparkles, Save,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

function initials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(" ")
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  }
  return (email ?? "??").slice(0, 2).toUpperCase()
}

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
]

const TEAMS = [
  { value: "strength", label: "Team Strength" },
  { value: "wisdom", label: "Team Wisdom" },
  { value: "swift", label: "Team Swift" },
]

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

/** Days in a birthday month. Birthdays are stored against the year 2000, a
 *  leap year, so 29 February stays available. Defaults to 31 with no month. */
function daysInBirthMonth(month: string): number {
  const m = Number(month)
  if (!m) return 31
  return new Date(2000, m, 0).getDate()
}

export default function ProfilePage() {
  const { data: currentUser, isLoading, isRefetching, refetch } = useCurrentUser()
  const queryClient = useQueryClient()
  const celebrate = useCelebrate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<ProfileFields>({})
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const seededProfileId = useRef<string | null>(null)

  // Seed editable fields once per officer. Background refreshes and headshot
  // uploads must not replace a draft the officer is currently typing.
  useEffect(() => {
    if (!currentUser) { seededProfileId.current = null; return }
    const fresh: ProfileFields = {
      role: currentUser.role,
      full_name: currentUser.full_name,
      phone: currentUser.phone,
      oscar: normalizeOscarLabel(currentUser.oscar),
      team: currentUser.team,
      date_of_birth: currentUser.date_of_birth,
      gender: currentUser.gender,
      city: currentUser.city,
      local_government_area: currentUser.local_government_area,
      state: currentUser.state,
      nearest_bus_stop_landmark: currentUser.nearest_bus_stop_landmark,
      bio: currentUser.bio,
    }
    if (seededProfileId.current !== currentUser.id) {
      seededProfileId.current = currentUser.id
      setForm(fresh)
    } else {
      // Assignments are read-only here and remain authoritative on the server.
      setForm(previous => ({ ...previous, role: fresh.role, oscar: fresh.oscar, team: fresh.team }))
    }
    setPhotoUrl(currentUser.photo_url)
  }, [currentUser])

  let monthVal = ""
  let dayVal = ""
  if (form.date_of_birth) {
    const parts = form.date_of_birth.trim().split("-")
    if (parts.length === 3) {
      monthVal = parts[1].padStart(2, "0")
      dayVal = parts[2].padStart(2, "0")
    } else if (parts.length === 2) {
      monthVal = parts[0].padStart(2, "0")
      dayVal = parts[1].padStart(2, "0")
    }
  }

  const handleBirthdayChange = (newMonth: string, newDay: string) => {
    if (!newMonth && !newDay) {
      set("date_of_birth", null)
      return
    }
    const m = (newMonth || monthVal || "01").padStart(2, "0")
    // A day the new month doesn't have (31 February) moves to its last day.
    const d = String(Math.min(Number(newDay || dayVal || "01"), daysInBirthMonth(m))).padStart(2, "0")
    set("date_of_birth", `2000-${m}-${d}`)
  }

  // Live completion — includes the (possibly just-uploaded) headshot
  const completion = useMemo(
    () => computeProfileCompletion({ ...form, photo_url: photoUrl }),
    [form, photoUrl]
  )

  // Fields the officer can still fill in here. Oscar and team are assigned by
  // someone else, so reminding the officer to "add" them would be misleading.
  const stillToAdd = completion.missing.filter(spec => spec.key !== "oscar" && spec.key !== "team")
  const blank = new Set(stillToAdd.map(spec => spec.key))
  const stillToAddLabels = stillToAdd.map(spec => spec.label).join(", ")

  const set = <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so choosing the same file again still fires onChange
    e.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return }
    if (file.size > 15 * 1024 * 1024) { toast.error("Image must be under 15MB"); return }
    // Full-length or group photos are common here — open the cropper so the
    // officer can isolate just the headshot before it's uploaded.
    setPendingFile(file)
    setCropOpen(true)
  }

  const handleCroppedUpload = async (blob: Blob) => {
    if (!currentUser) return
    setCropOpen(false)
    setUploading(true)
    try {
      const path = `${currentUser.id}/headshot-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      })
      if (upErr) throw upErr
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl
      // Persist immediately so the headshot survives even if they don't hit Save
      const { error: dbErr } = await supabase.from("users").update({ photo_url: url, updated_at: new Date().toISOString() }).eq("id", currentUser.id)
      if (dbErr) throw dbErr
      setPhotoUrl(url)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      toast.success("Headshot updated")
    } catch (err: any) {
      notifyError(err, "Upload failed")
    } finally {
      setUploading(false)
      setPendingFile(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    setSaving(true)
    try {
      const result = computeProfileCompletion({ ...form, photo_url: photoUrl })
      const payload: any = {
        full_name: form.full_name?.trim() || null,
        phone: form.phone?.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        city: form.city?.trim() || null,
        local_government_area: form.local_government_area?.trim() || null,
        state: form.state?.trim() || null,
        nearest_bus_stop_landmark: form.nearest_bus_stop_landmark?.trim() || null,
        bio: form.bio?.trim() || null,
        profile_completed_at: result.isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("users").update(payload).eq("id", currentUser.id)
      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      const justCompleted = result.isComplete && !currentUser.profile_completed_at
      if (justCompleted) {
        celebrate("Profile complete — thank you!")
      } else if (stillToAdd.length) {
        // Saving is never blocked — this is only a nudge towards 100%.
        toast.success("Profile saved", { description: `Still to add: ${stillToAddLabels}`, duration: 8000 })
      } else {
        toast.success("Profile saved")
      }
    } catch (err: any) {
      notifyError(err, "Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-24" aria-label="Loading your profile"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" /></div>
  }

  // The read failed (or came back empty): say so instead of spinning forever.
  if (!currentUser) {
    return (
      <ErrorState
        className="mx-auto max-w-xl rounded-xl border"
        title="Your profile could not be loaded"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
        retrying={isRefetching}
      />
    )
  }

  const ROLE_LABELS: Record<string, string> = {
    noscar_den: "November (Den)",
    head_noscar_den: "Head, November (Den)",
    noscar_nest: "November (Nest)",
    head_noscar_nest: "Head, November (Nest)",
    hospitality_oscar: "November (Nest)",
    head_hospitality_oscar: "Head, November (Nest)",
  }
  const roleLabel = ROLE_LABELS[currentUser.role ?? ""] ?? (currentUser.role ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="space-y-6 page-enter">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-card p-6">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            {/* Headshot with upload */}
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-white/10 shadow-xl">
                {photoUrl ? <AvatarImage src={photoUrl} className="object-cover" /> : <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">{initials(currentUser.full_name, currentUser.email)}</AvatarFallback>}
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background transition-all hover:brightness-110 disabled:opacity-60"
                aria-label="Change headshot"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold tracking-tight">{currentUser.full_name || "Your Name"}</h1>
              <p className="text-sm text-muted-foreground">{currentUser.email}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                {currentUser.role && <Badge className="border-0 bg-primary/8 text-primary uppercase text-xs tracking-wide">{roleLabel}</Badge>}
                {normalizeOscarLabel(currentUser.oscar) && <Badge variant="outline" className="text-xs">{normalizeOscarLabel(currentUser.oscar)}</Badge>}
                {currentUser.team && <Badge variant="outline" className="text-xs uppercase">{currentUser.is_team_head ? '★ ' : ''}{currentUser.team}</Badge>}
              </div>
            </div>
          </div>

          {/* Completion ring */}
          <div className="flex flex-col items-center gap-1">
            <CompletionRing percent={completion.percent} />
            {completion.isComplete ? (
              <span className="flex items-center gap-1 text-xs text-[hsl(var(--success))]"><CheckCircle2 className="h-3.5 w-3.5" /> Profile complete</span>
            ) : (
              <span className="text-xs text-muted-foreground">{completion.missingRequired.length} required left</span>
            )}
          </div>
        </div>
      </div>

      {/* Completion checklist (only while incomplete) */}
      {!completion.isComplete && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-amber-400/50 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-500" /> Complete your profile
              </CardTitle>
              <CardDescription>A complete profile helps Command coordinate operations and assign you accurately.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {completion.missing.map(spec => (
                  <div key={spec.key} className="flex items-center gap-2 text-sm">
                    <Circle className={cn("h-3.5 w-3.5", spec.required ? "text-amber-500" : "text-muted-foreground/40")} />
                    <span className={spec.required ? "font-medium" : "text-muted-foreground"}>{spec.label}</span>
                    {spec.required && <Badge variant="outline" className="border-amber-400/50 text-[11px] uppercase text-amber-600 dark:text-amber-400">required</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Edit form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-primary" /> Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" icon={User} htmlFor="profile-full-name" required blank={blank.has("full_name")}>
              <Input id="profile-full-name" autoComplete="name" value={form.full_name ?? ""} onChange={e => set("full_name", e.target.value)} placeholder="John Doe" />
            </Field>
            <Field label="Oscar unit" icon={Briefcase} htmlFor="profile-oscar" required>
              <Input id="profile-oscar" value={form.oscar ?? "Not assigned"} disabled className="opacity-75" aria-describedby="profile-oscar-hint" />
              <p id="profile-oscar-hint" className="mt-1 text-[11px] text-muted-foreground">
                Unit assignments are managed by your Head of Unit or an administrator.
              </p>
            </Field>
            <Field label="Phone" icon={Phone} htmlFor="profile-phone" required blank={blank.has("phone")}>
              <Input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} placeholder="+234 800 000 0000" />
            </Field>
            <Field label="Email" icon={Mail} htmlFor="profile-email">
              <Input id="profile-email" value={currentUser.email ?? ""} disabled className="opacity-70" />
            </Field>
            <Field label="Protocol team" icon={ShieldCheck} htmlFor="profile-team" required={requiresProtocolTeam(currentUser.role)}>
              <Select value={form.team ?? ""} disabled>
                <SelectTrigger id="profile-team" aria-describedby="profile-team-hint"><SelectValue placeholder="Not assigned" /></SelectTrigger>
                <SelectContent>
                  {TEAMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p id="profile-team-hint" className="mt-1 text-[11px] text-muted-foreground">
                {requiresProtocolTeam(currentUser.role)
                  ? "Prayer and protocol teams are assigned by Welfare or an administrator."
                  : "A protocol team is not required for your role."}
              </p>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Cake className="h-4 w-4 text-primary" /> Personal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Birthday" icon={Cake} htmlFor="profile-birth-month" blank={blank.has("date_of_birth")}>
              <div className="grid grid-cols-2 gap-2">
                <Select value={monthVal} onValueChange={v => handleBirthdayChange(v, dayVal)}>
                  <SelectTrigger id="profile-birth-month" aria-label="Birthday month"><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={dayVal} onValueChange={v => handleBirthdayChange(monthVal, v)}>
                  <SelectTrigger id="profile-birth-day" aria-label="Birthday day"><SelectValue placeholder="Day" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: daysInBirthMonth(monthVal) }, (_, i) => {
                      const val = String(i + 1).padStart(2, "0")
                      return <SelectItem key={val} value={val}>{i + 1}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="Gender" icon={User} htmlFor="profile-gender" blank={blank.has("gender")}>
              <Select value={form.gender ?? ""} onValueChange={v => { if (v) set("gender", v) }}>
                <SelectTrigger id="profile-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="City" icon={MapPin} htmlFor="profile-city" blank={blank.has("city")}>
              <Input id="profile-city" autoComplete="address-level2" value={form.city ?? ""} onChange={e => set("city", e.target.value)} placeholder="Lagos" />
            </Field>
            <Field label="Local government area" icon={MapPin} htmlFor="profile-lga" blank={blank.has("local_government_area")}>
              <Input id="profile-lga" autoComplete="address-level2" value={form.local_government_area ?? ""} onChange={e => set("local_government_area", e.target.value)} placeholder="e.g. Ikeja" />
            </Field>
            <Field label="State" icon={MapPin} htmlFor="profile-state" blank={blank.has("state")}>
              <Input id="profile-state" autoComplete="address-level1" value={form.state ?? ""} onChange={e => set("state", e.target.value)} placeholder="e.g. Lagos" />
            </Field>
            <Field label="Nearest bus stop / landmark" icon={MapPin} htmlFor="profile-landmark" blank={blank.has("nearest_bus_stop_landmark")}>
              <Input id="profile-landmark" value={form.nearest_bus_stop_landmark ?? ""} onChange={e => set("nearest_bus_stop_landmark", e.target.value)} placeholder="e.g. Allen Junction" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Short bio" icon={Sparkles} htmlFor="profile-bio" blank={blank.has("bio")}>
                <Textarea id="profile-bio" rows={3} value={form.bio ?? ""} onChange={e => set("bio", e.target.value)} placeholder="A sentence or two about your protocol experience…" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Location & notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <LocationSharingControl />
            <DeviceNotificationControl />
          </CardContent>
        </Card>

        {stillToAdd.length > 0 && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-500/5 px-3 py-2.5 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>
              <span className="font-medium">Still to add: </span>
              {stillToAddLabels}.
              <span className="text-muted-foreground"> You can save now and add {stillToAdd.length === 1 ? "it" : "these"} later — your profile reaches 100% once everything is filled in.</span>
            </p>
          </div>
        )}

        {/* On a phone the save bar stays in reach, just above the bottom tab
            bar (--bottom-nav-h, globals.css), while the form scrolls. */}
        <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-2 pl-3 shadow-elevation-md backdrop-blur-md sm:static sm:z-auto sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <Link href="/change-password" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
          <Button type="submit" className="gap-2" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </div>
      </form>

      <HeadshotCropDialog
        file={pendingFile}
        open={cropOpen}
        onClose={() => { setCropOpen(false); setPendingFile(null) }}
        onCropped={handleCroppedUpload}
      />
    </div>
  )
}

function Field({
  label, icon: Icon, required, blank, htmlFor, children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  required?: boolean
  /** Nothing entered yet — draws a soft amber outline as a reminder, never an error. */
  blank?: boolean
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", blank && "[&_input]:border-amber-400/70 [&_textarea]:border-amber-400/70 [&_button]:border-amber-400/70")}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
        {required && <span className="text-amber-500">*</span>}
        {blank && <span className="font-normal text-amber-600 dark:text-amber-400">· not added yet</span>}
      </Label>
      {children}
    </div>
  )
}
