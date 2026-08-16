"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { computeProfileCompletion } from "@/lib/profile-completion"
import { CompletionRing } from "@/components/profile/CompletionRing"
import {
  User, Mail, Phone, MapPin, Cake, HeartPulse, Award, Calendar,
  ShieldCheck, Briefcase, Activity, CheckCircle2, Circle, Clock,
  Edit, Trash2, UserCheck, UserX, Copy, ExternalLink, Sparkles, AlertCircle, Compass, X
} from "lucide-react"

import { toast } from "sonner"

export type OfficerProfileData = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  oscar: string | null
  role: string
  unit: string | null
  current_title_id: string | null
  is_active: boolean
  is_online?: boolean
  activation_status: string
  photo_url?: string | null
  team?: string | null
  is_team_head?: boolean | null
  created_at: string
  date_of_birth?: string | null
  gender?: string | null
  address?: string | null
  city?: string | null
  bio?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  profile_completed_at?: string | null
  last_seen?: string | null
  updated_at?: string | null
}

interface OfficerProfileDialogProps {
  officer: OfficerProfileData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canManage?: boolean
  onEdit?: (officer: OfficerProfileData) => void
  onAssignTitle?: (officer: OfficerProfileData) => void
  onToggleActivation?: (officer: OfficerProfileData) => void
  onDelete?: (officer: OfficerProfileData) => void
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

export function OfficerProfileDialog({
  officer,
  open,
  onOpenChange,
  canManage = false,
  onEdit,
  onAssignTitle,
  onToggleActivation,
  onDelete
}: OfficerProfileDialogProps) {
  // Query full assignment and operational data when dialog is opened
  const { data: details, isLoading: loadingDetails } = useQuery({
    queryKey: ['officer-details', officer?.id],
    queryFn: async () => {
      if (!officer?.id) return null
      const res = await fetch(`/api/officers/${officer.id}/details`)
      if (!res.ok) throw new Error('Failed to load officer details')
      return res.json()
    },
    enabled: open && !!officer?.id,
    staleTime: 30 * 1000
  })

  const mergedOfficer: OfficerProfileData | null = useMemo(() => {
    if (!officer) return null
    if (details?.officer) {
      return {
        ...officer,
        ...details.officer,
        is_active: officer.is_active,
        is_online: officer.is_online
      }
    }
    return officer
  }, [officer, details])

  const completion = useMemo(() => {
    if (!mergedOfficer) return { percent: 0, isComplete: false, missing: [], missingRequired: [] }
    return computeProfileCompletion({
      full_name: mergedOfficer.full_name,
      photo_url: mergedOfficer.photo_url,
      phone: mergedOfficer.phone,
      oscar: mergedOfficer.oscar,
      team: mergedOfficer.team,
      date_of_birth: mergedOfficer.date_of_birth,
      gender: mergedOfficer.gender,
      address: mergedOfficer.address,
      city: mergedOfficer.city,
      bio: mergedOfficer.bio,
      emergency_contact_name: mergedOfficer.emergency_contact_name,
      emergency_contact_phone: mergedOfficer.emergency_contact_phone
    })
  }, [mergedOfficer])

  if (!mergedOfficer) return null

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      const parts = name.trim().split(" ")
      return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
    }
    return (email ?? "??").slice(0, 2).toUpperCase()
  }

  const formatRole = (role?: string | null) => {
    if (!role) return "Officer"
    return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'dev_admin':
      case 'super_admin':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
      case 'admin':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
      case 'captain':
      case 'vice_captain':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      case 'command':
      case 'head_of_command':
      case 'head_of_operations':
      case 'hod':
      case 'hop':
        return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30'
      default:
        return 'bg-secondary text-secondary-foreground'
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  // Calculate birthday / age
  let birthdayFormatted = null
  let age = null
  if (mergedOfficer.date_of_birth) {
    try {
      const dob = new Date(mergedOfficer.date_of_birth)
      if (!isNaN(dob.getTime())) {
        birthdayFormatted = `${MONTH_NAMES[dob.getMonth()]} ${dob.getDate()}, ${dob.getFullYear()}`
        const diff = Date.now() - dob.getTime()
        const ageDate = new Date(diff)
        age = Math.abs(ageDate.getUTCFullYear() - 1970)
      }
    } catch {
      birthdayFormatted = mergedOfficer.date_of_birth
    }
  }

  const formattedJoinDate = mergedOfficer.created_at
    ? new Date(mergedOfficer.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    : "—"

  const formattedLastSeen = mergedOfficer.last_seen
    ? new Date(mergedOfficer.last_seen).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "Never recorded"

  const titleAssignments = details?.titleAssignments || []
  const dutyAssignments = details?.dutyAssignments || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl border-primary/20 shadow-2xl">
        {/* Header Cover Banner */}
        <div className="relative p-6 bg-gradient-to-br from-primary/20 via-primary/5 to-background border-b shrink-0 overflow-hidden">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/15 blur-2xl pointer-events-none" />
          <div className="absolute left-1/3 -bottom-10 h-32 w-32 rounded-full bg-sky-500/10 blur-xl pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 border border-border/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar className="h-20 w-20 border-3 border-background shadow-xl ring-2 ring-primary/20">
                  {mergedOfficer.photo_url ? (
                    <AvatarImage src={mergedOfficer.photo_url} alt={mergedOfficer.full_name || "Officer"} className="object-cover" />
                  ) : (
                    <AvatarFallback className="text-xl font-bold bg-primary/20 text-primary">
                      {getInitials(mergedOfficer.full_name, mergedOfficer.email)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span
                  title={mergedOfficer.is_online ? "Online right now" : "Currently offline"}
                  className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background ring-1 ring-black/10 ${
                    mergedOfficer.is_online ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {mergedOfficer.full_name || "Unnamed Officer"}
                  </h2>
                  {mergedOfficer.activation_status === "pending" ? (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                      Pending Approval
                    </Badge>
                  ) : mergedOfficer.is_active ? (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span>{mergedOfficer.email}</span>
                </p>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge variant="outline" className={`text-[10px] uppercase font-semibold tracking-wider ${getRoleColor(mergedOfficer.role)}`}>
                    {formatRole(mergedOfficer.role)}
                  </Badge>

                  {mergedOfficer.oscar && (
                    <Badge variant="secondary" className="text-[10px] font-medium">
                      {mergedOfficer.oscar}
                    </Badge>
                  )}

                  {mergedOfficer.team && (
                    <Badge variant="outline" className="text-[10px] uppercase border-primary/40 text-primary bg-primary/5">
                      {mergedOfficer.is_team_head ? "★ Head of " : ""}{mergedOfficer.team}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Completion indicator */}
            <div className="hidden sm:flex flex-col items-center justify-center shrink-0 bg-background/90 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-border/60 shadow-sm min-w-[90px]">
              <CompletionRing percent={completion.percent} size={54} strokeWidth={5} showLabel={false} />
              <span className={`text-[10px] font-semibold mt-1 ${completion.isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {completion.isComplete ? "Complete" : `${completion.percent}% Done`}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action Bar for Admins & Communication */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 bg-muted/40 border-b text-xs shrink-0">
          <div className="flex items-center gap-2">
            {mergedOfficer.phone && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                asChild
              >
                <a href={`tel:${mergedOfficer.phone}`}>
                  <Phone className="h-3.5 w-3.5" />
                  <span>Call ({mergedOfficer.phone})</span>
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400"
              asChild
            >
              <a href={`mailto:${mergedOfficer.email}`}>
                <Mail className="h-3.5 w-3.5" />
                <span>Send Email</span>
              </a>
            </Button>
          </div>

          {canManage && (
            <div className="flex items-center gap-1.5 ml-auto">
              {onEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  onClick={() => {
                    onOpenChange(false)
                    onEdit(mergedOfficer)
                  }}
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Button>
              )}

              {onAssignTitle && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400"
                  onClick={() => {
                    onOpenChange(false)
                    onAssignTitle(mergedOfficer)
                  }}
                >
                  <Award className="h-3.5 w-3.5" />
                  <span>Titles</span>
                </Button>
              )}

              {onToggleActivation && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-8 gap-1 text-xs ${
                    mergedOfficer.is_active ? "text-orange-600 hover:text-orange-700" : "text-emerald-600 hover:text-emerald-700"
                  }`}
                  onClick={() => onToggleActivation(mergedOfficer)}
                >
                  {mergedOfficer.is_active ? (
                    <>
                      <UserX className="h-3.5 w-3.5" />
                      <span>Deactivate</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Activate</span>
                    </>
                  )}
                </Button>
              )}

              {onDelete && mergedOfficer.role !== 'dev_admin' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    onOpenChange(false)
                    onDelete(mergedOfficer)
                  }}
                  title="Delete Officer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Modal Body / Tabs */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="personal" className="text-xs">Personal & Emergency</TabsTrigger>
              <TabsTrigger value="titles" className="text-xs">Titles & Roles</TabsTrigger>
              <TabsTrigger value="duties" className="text-xs">Duty Operations</TabsTrigger>
            </TabsList>

            {/* TAB 1: OVERVIEW */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" /> Identity & Protocol Unit
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Full Name:</span>
                      <span className="font-medium">{mergedOfficer.full_name || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Oscar Unit:</span>
                      <span className="font-medium">{mergedOfficer.oscar || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Protocol Team:</span>
                      <span className="font-medium capitalize">
                        {mergedOfficer.team ? (
                          <>
                            {mergedOfficer.is_team_head ? "★ " : ""}Team {mergedOfficer.team}
                          </>
                        ) : (
                          "Unassigned"
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-muted-foreground">System Role:</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {formatRole(mergedOfficer.role)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" /> Contact & Connectivity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Email:</span>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="truncate max-w-[150px] sm:max-w-[180px]">{mergedOfficer.email}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(mergedOfficer.email, "Email")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Phone:</span>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>{mergedOfficer.phone || "Not provided"}</span>
                        {mergedOfficer.phone && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => copyToClipboard(mergedOfficer.phone!, "Phone")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Last Seen Online:</span>
                      <span className="font-medium flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${mergedOfficer.is_online ? "bg-emerald-500" : "bg-zinc-400"}`} />
                        {formattedLastSeen}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-muted-foreground">Joined / Created:</span>
                      <span className="font-medium">{formattedJoinDate}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Profile Completion Card */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500" /> Profile Completion Breakdown
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${
                        completion.isComplete
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {completion.percent}% Complete
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="grid gap-2 sm:grid-cols-2 text-xs">
                    <div className="flex items-center gap-2">
                      {mergedOfficer.photo_url ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span>Headshot Photo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {mergedOfficer.full_name ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span>Full Name</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {mergedOfficer.phone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span>Phone Number</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {mergedOfficer.emergency_contact_name && mergedOfficer.emergency_contact_phone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span>Emergency Contact Info</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {mergedOfficer.date_of_birth ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      )}
                      <span>Date of Birth</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {mergedOfficer.address || mergedOfficer.city ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      )}
                      <span>Residential Location</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: PERSONAL & EMERGENCY */}
            <TabsContent value="personal" className="space-y-4 mt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Personal Information */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Cake className="h-4 w-4 text-primary" /> Personal Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Date of Birth:</span>
                      <span className="font-medium">{birthdayFormatted || "Not specified"}</span>
                    </div>
                    {age !== null && (
                      <div className="flex justify-between items-center py-1 border-b border-border/40">
                        <span className="text-muted-foreground">Age:</span>
                        <span className="font-medium">{age} years old</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Gender:</span>
                      <span className="font-medium capitalize">{mergedOfficer.gender || "Not specified"}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">City:</span>
                      <span className="font-medium">{mergedOfficer.city || "Not specified"}</span>
                    </div>
                    <div className="flex justify-between items-start py-1">
                      <span className="text-muted-foreground shrink-0">Address:</span>
                      <span className="font-medium text-right ml-2">{mergedOfficer.address || "Not specified"}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Emergency Contact */}
                <Card className="border-red-500/20 bg-red-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                      <HeartPulse className="h-4 w-4 text-red-500" /> Emergency Contact (Next of Kin)
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      Used by Command in case of urgent medical or operational incident.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded-lg bg-background/80 p-3 border space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Contact Name:</span>
                        <span className="font-semibold text-foreground">
                          {mergedOfficer.emergency_contact_name || "Not provided"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Contact Phone:</span>
                        <span className="font-semibold text-foreground">
                          {mergedOfficer.emergency_contact_phone || "Not provided"}
                        </span>
                      </div>
                    </div>

                    {mergedOfficer.emergency_contact_phone && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full h-8 text-xs gap-1.5 shadow-sm"
                        asChild
                      >
                        <a href={`tel:${mergedOfficer.emergency_contact_phone}`}>
                          <Phone className="h-3.5 w-3.5" />
                          <span>Call Emergency Contact</span>
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Bio */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" /> Officer Biography & Experience
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs">
                  <p className="text-muted-foreground leading-relaxed italic">
                    {mergedOfficer.bio ? `"${mergedOfficer.bio}"` : "No biography provided yet."}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: TITLES & PROGRAM ROLES */}
            <TabsContent value="titles" className="space-y-4 mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" /> Title & Program Assignments
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Official titles and program roles assigned to this officer.
                      </CardDescription>
                    </div>
                    {canManage && onAssignTitle && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => {
                          onOpenChange(false)
                          onAssignTitle(mergedOfficer)
                        }}
                      >
                        <Award className="h-3.5 w-3.5" />
                        <span>Manage Titles</span>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-xs">
                  {loadingDetails ? (
                    <div className="py-8 text-center text-muted-foreground animate-pulse">
                      Loading assignments…
                    </div>
                  ) : titleAssignments.length === 0 ? (
                    <div className="py-8 text-center border border-dashed rounded-lg">
                      <Award className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="font-medium text-foreground">No specific program titles assigned</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Operating under general call sign: {mergedOfficer.oscar || formatRole(mergedOfficer.role)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {titleAssignments.map((assignment: any) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {assignment.official_titles?.name || "Assigned Role"}
                              </span>
                              {assignment.official_titles?.is_team_lead && (
                                <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                  Team Lead
                                </Badge>
                              )}
                              {assignment.is_active ? (
                                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                  Active Assignment
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                  Past
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>Program: {assignment.programs?.name || "General Permanent"}</span>
                              {assignment.programs?.status && (
                                <Badge variant="outline" className="text-[9px] capitalize">
                                  {assignment.programs.status}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="text-right text-[10px] text-muted-foreground">
                            <span>
                              {assignment.assigned_at
                                ? new Date(assignment.assigned_at).toLocaleDateString()
                                : "—"}
                            </span>
                            {assignment.assigned_by_user?.full_name && (
                              <p className="truncate max-w-[120px]">
                                by {assignment.assigned_by_user.full_name}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 4: DUTY OPERATIONS */}
            <TabsContent value="duties" className="space-y-4 mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Compass className="h-4 w-4 text-primary" /> Duty Officer (DO) Journey Assignments
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Recent field operations, VIP escorts, and route duty deployments.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs">
                  {loadingDetails ? (
                    <div className="py-8 text-center text-muted-foreground animate-pulse">
                      Loading mission assignments…
                    </div>
                  ) : dutyAssignments.length === 0 ? (
                    <div className="py-8 text-center border border-dashed rounded-lg">
                      <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="font-medium text-foreground">No recent journey deployments</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Officer has not been assigned as Lead/Support DO on recorded journeys yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {dutyAssignments.map((duty: any) => {
                        const journey = duty.journeys
                        return (
                          <div
                            key={duty.id}
                            className="p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                  {journey?.origin || "Origin"} → {journey?.destination || "Destination"}
                                </span>
                                {duty.is_lead && (
                                  <Badge className="text-[9px] bg-primary text-primary-foreground">
                                    Lead DO
                                  </Badge>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[9px] capitalize ${
                                  duty.status === 'acknowledged'
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                    : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                }`}
                              >
                                {duty.status || "Pending"}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground gap-2 pt-1 border-t border-border/30">
                              <div>
                                {journey?.papas?.full_name ? (
                                  <span>VIP: <strong className="text-foreground">{journey.papas.title ? `${journey.papas.title} ` : ''}{journey.papas.full_name}</strong></span>
                                ) : (
                                  <span>VIP: Unspecified</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  {journey?.scheduled_departure
                                    ? new Date(journey.scheduled_departure).toLocaleString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit"
                                      })
                                    : "Schedule pending"}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
