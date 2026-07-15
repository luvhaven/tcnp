"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { cn } from "@/lib/utils"
import { computeProfileCompletion, type ProfileFields } from "@/lib/profile-completion"
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Camera, Loader2, CheckCircle2, Circle, ShieldCheck, KeyRound, User, Phone,
  Mail, MapPin, Cake, Briefcase, HeartPulse, Sparkles, Save,
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

// Canonical Oscar unit names — same vocabulary as signup (oscarToRole parses these)
const OSCAR_UNITS = [
  "Alpha Oscar",
  "Command",
  "Compliance Oscar",
  "Delta Oscar",
  "Hospitality Oscar",
  "November Oscar (Den)",
  "November Oscar (Nest)",
  "Sierra Oscar",
  "Tango Oscar",
  "Victor Oscar",
  "Welfare Oscar",
]

const TEAMS = [
  { value: "strength", label: "Team Strength" },
  { value: "wisdom", label: "Team Wisdom" },
  { value: "swift", label: "Team Swift" },
]

export default function ProfilePage() {
  const { data: currentUser, isLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const celebrate = useCelebrate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<ProfileFields>({})
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [cropOpen, setCropOpen] = useState(false)

  // Seed form once the cached profile arrives
  useEffect(() => {
    if (!currentUser) return
    setForm({
      full_name: currentUser.full_name,
      phone: currentUser.phone,
      oscar: currentUser.oscar,
      team: currentUser.team,
      date_of_birth: currentUser.date_of_birth,
      gender: currentUser.gender,
      city: currentUser.city,
      address: currentUser.address,
      bio: currentUser.bio,
      emergency_contact_name: currentUser.emergency_contact_name,
      emergency_contact_phone: currentUser.emergency_contact_phone,
    })
    setPhotoUrl(currentUser.photo_url)
  }, [currentUser])

  // Live completion — includes the (possibly just-uploaded) headshot
  const completion = useMemo(
    () => computeProfileCompletion({ ...form, photo_url: photoUrl }),
    [form, photoUrl]
  )

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
      toast.error(err.message || "Upload failed")
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
        // Officers may re-home themselves when leadership moves them to a new unit
        oscar: form.oscar || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        city: form.city?.trim() || null,
        address: form.address?.trim() || null,
        bio: form.bio?.trim() || null,
        emergency_contact_name: form.emergency_contact_name?.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone?.trim() || null,
        profile_completed_at: result.isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      // Officers can move between teams at any time. Switching away from the
      // team you currently head hands over head-of-team status — you can't
      // moderate a team chat you're no longer a member of.
      if (form.team && form.team !== currentUser.team) {
        payload.team = form.team
        if (currentUser.is_team_head) payload.is_team_head = false
      }

      const { error } = await supabase.from("users").update(payload).eq("id", currentUser.id)
      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      const justCompleted = result.isComplete && !currentUser.profile_completed_at
      if (justCompleted) {
        celebrate("Profile complete — thank you!")
      } else {
        toast.success("Profile saved")
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !currentUser) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const roleLabel = (currentUser.role ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="space-y-6 page-enter">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 text-white">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative z-10 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            {/* Headshot with upload */}
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-white/10 shadow-xl">
                {photoUrl ? <AvatarImage src={photoUrl} className="object-cover" /> : <AvatarFallback className="bg-primary/20 text-2xl text-white">{initials(currentUser.full_name, currentUser.email)}</AvatarFallback>}
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-2 ring-slate-900 transition-transform hover:scale-105 disabled:opacity-60"
                aria-label="Change headshot"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold tracking-tight">{currentUser.full_name || "Your Name"}</h1>
              <p className="text-sm text-slate-300">{currentUser.email}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                {currentUser.role && <Badge className="border-0 bg-primary/20 text-primary-foreground uppercase text-[10px] tracking-wide">{roleLabel}</Badge>}
                {currentUser.oscar && <Badge variant="outline" className="border-white/20 text-white text-[10px]">{currentUser.oscar}</Badge>}
                {currentUser.team && <Badge variant="outline" className="border-white/20 text-white text-[10px] uppercase">{currentUser.is_team_head ? "★ " : ""}{currentUser.team}</Badge>}
              </div>
            </div>
          </div>

          {/* Completion ring */}
          <div className="flex flex-col items-center gap-1">
            <CompletionRing percent={completion.percent} />
            {completion.isComplete ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Profile complete</span>
            ) : (
              <span className="text-xs text-slate-400">{completion.missingRequired.length} required left</span>
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
              <CardDescription>A complete profile helps Command coordinate operations and reach you in an emergency.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {completion.missing.map(spec => (
                  <div key={spec.key} className="flex items-center gap-2 text-sm">
                    <Circle className={cn("h-3.5 w-3.5", spec.required ? "text-amber-500" : "text-muted-foreground/40")} />
                    <span className={spec.required ? "font-medium" : "text-muted-foreground"}>{spec.label}</span>
                    {spec.required && <Badge variant="outline" className="border-amber-400/50 text-[9px] uppercase text-amber-600 dark:text-amber-400">required</Badge>}
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
            <Field label="Full name" icon={User} required>
              <Input value={form.full_name ?? ""} onChange={e => set("full_name", e.target.value)} placeholder="John Doe" />
            </Field>
            <Field label="Oscar unit" icon={Briefcase} required>
              {/* Radix's hidden native-select mirror fires a spurious onValueChange("")
                  on mount before it has synced with our controlled value — none of our
                  real options are ever empty, so guard against clearing on that no-op. */}
              <Select value={form.oscar ?? ""} onValueChange={v => { if (v) set("oscar", v) }}>
                <SelectTrigger><SelectValue placeholder="Select your Oscar…" /></SelectTrigger>
                <SelectContent>
                  {OSCAR_UNITS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  {/* Preserve a legacy/custom value so the select doesn't blank it */}
                  {form.oscar && !OSCAR_UNITS.includes(form.oscar) && (
                    <SelectItem value={form.oscar}>{form.oscar}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone" icon={Phone} required>
              <Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} placeholder="+234 800 000 0000" />
            </Field>
            <Field label="Email" icon={Mail}>
              <Input value={currentUser.email ?? ""} disabled className="opacity-70" />
            </Field>
            <Field label="Protocol team" icon={ShieldCheck} required>
              <Select value={form.team ?? ""} onValueChange={v => { if (v) set("team", v) }}>
                <SelectTrigger><SelectValue placeholder="Select your team" /></SelectTrigger>
                <SelectContent>
                  {TEAMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {currentUser.is_team_head && form.team === currentUser.team && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  ★ You are head of this team. Switching teams will hand over your head-of-team status.
                </p>
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Cake className="h-4 w-4 text-primary" /> Personal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" icon={Cake}>
              <Input type="date" value={form.date_of_birth ?? ""} onChange={e => set("date_of_birth", e.target.value)} />
            </Field>
            <Field label="Gender" icon={User}>
              <Select value={form.gender ?? ""} onValueChange={v => { if (v) set("gender", v) }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="City" icon={MapPin}>
              <Input value={form.city ?? ""} onChange={e => set("city", e.target.value)} placeholder="Lagos" />
            </Field>
            <Field label="Address" icon={MapPin}>
              <Input value={form.address ?? ""} onChange={e => set("address", e.target.value)} placeholder="Street, area" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Short bio" icon={Sparkles}>
                <Textarea rows={3} value={form.bio ?? ""} onChange={e => set("bio", e.target.value)} placeholder="A sentence or two about your protocol experience…" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4 text-primary" /> Emergency Contact</CardTitle>
            <CardDescription>Used only by Command in a genuine emergency.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" icon={User} required>
              <Input value={form.emergency_contact_name ?? ""} onChange={e => set("emergency_contact_name", e.target.value)} placeholder="Next of kin" />
            </Field>
            <Field label="Contact phone" icon={Phone} required>
              <Input type="tel" inputMode="tel" value={form.emergency_contact_phone ?? ""} onChange={e => set("emergency_contact_phone", e.target.value)} placeholder="+234 800 000 0000" />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/change-password" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
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
  label, icon: Icon, required, children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
        {required && <span className="text-amber-500">*</span>}
      </Label>
      {children}
    </div>
  )
}
