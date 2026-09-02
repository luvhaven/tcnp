"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Search, Cake, Phone, Mail, HeartPulse, Loader2, Users, PartyPopper, Eye,
} from "lucide-react"
import { OfficerProfileDialog, type OfficerProfileData } from "@/components/officers/OfficerProfileDialog"
import { useUnitAccess } from "@/hooks/useUnitAccess"

const supabase = createClient()

type WelfareOfficer = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  photo_url: string | null
  oscar: string | null
  role: string | null
  team: string | null
  birth_month: number | null
  birth_day: number | null
  is_active: boolean
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function initials(name?: string | null) {
  if (!name) return "??"
  const parts = name.trim().split(" ")
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}

function formatRole(role?: string | null) {
  if (!role) return null
  return role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

/** Days until the next occurrence of this month/day, 0-365 (today = 0). */
function daysUntilBirthday(month: number, day: number, today: Date): number {
  const year = today.getFullYear()
  let next = new Date(year, month - 1, day)
  next.setHours(0, 0, 0, 0)
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (next < todayMidnight) next = new Date(year + 1, month - 1, day)
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86400000)
}

/**
 * Head-of-Welfare directory: names, work contacts and birthdays (month/day
 * only — never the birth year). Emergency contacts are deliberately excluded. Backed by
 * the `get_welfare_directory_safe` SECURITY DEFINER function, which returns rows
 * only when the caller is Head of Welfare or an admin — the RLS-equivalent
 * gate lives server-side, this page just renders what it's given.
 */
export default function WelfareOfficerDirectory() {
  const [search, setSearch] = useState("")
  const [selectedOfficer, setSelectedOfficer] = useState<OfficerProfileData | null>(null)
  const { canManage } = useUnitAccess('welfare')

  const { data: officers = [], isLoading, error } = useQuery({
    queryKey: ["welfare-officer-directory"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_welfare_directory_safe")
        .select("id, full_name, email, phone, photo_url, oscar, role, team, birth_month, birth_day, is_active")
      if (error) throw error
      return (data ?? []) as WelfareOfficer[]
    },
  })

  const today = useMemo(() => new Date(), [])

  const upcomingBirthdays = useMemo(() => {
    return officers
      .filter(o => o.birth_month && o.birth_day)
      .map(o => ({ ...o, daysUntil: daysUntilBirthday(o.birth_month!, o.birth_day!, today) }))
      .filter(o => o.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [officers, today])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return officers
    return officers.filter(o =>
      (o.full_name ?? "").toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (o.oscar ?? "").toLowerCase().includes(q) ||
      (o.team ?? "").toLowerCase().includes(q)
    )
  }, [officers, search])

  const handleOpenOfficer = (officer: WelfareOfficer) => {
    const profileData: OfficerProfileData = {
      id: officer.id,
      email: officer.email || '',
      full_name: officer.full_name,
      phone: officer.phone,
      oscar: officer.oscar,
      role: officer.role || 'officer',
      unit: null,
      current_title_id: null,
      is_active: officer.is_active,
      activation_status: officer.is_active ? 'active' : 'inactive',
      photo_url: officer.photo_url,
      team: officer.team,
      created_at: new Date().toISOString(),
    }
    setSelectedOfficer(profileData)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (error) {
    return (
      <div className="empty-state rounded-xl border">
        <HeartPulse className="h-10 w-10" />
        <p className="font-medium">Couldn&apos;t load the officer directory</p>
        <p className="text-sm text-muted-foreground">{(error as any).message ?? "Please try again."}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {upcomingBirthdays.length > 0 && (
        <Card className="border-amber-400/50 bg-amber-500/5">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <PartyPopper className="h-4 w-4 text-amber-500" /> Upcoming Birthdays (next 30 days)
            </p>
            <div className="flex flex-wrap gap-2">
              {upcomingBirthdays.map(o => (
                <Badge
                  key={o.id}
                  variant="outline"
                  className="gap-1 border-amber-400/50 text-xs cursor-pointer hover:bg-amber-500/10 transition"
                  onClick={() => handleOpenOfficer(o)}
                >
                  <Cake className="h-3 w-3" />
                  {o.full_name} — {MONTH_NAMES[o.birth_month! - 1]} {o.birth_day}
                  {o.daysUntil === 0 && <span className="font-semibold text-amber-600 dark:text-amber-400">· Today!</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, unit, team…" className="pl-8" />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {filtered.length} officer{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state rounded-xl border">
          <Users className="h-10 w-10" />
          <p className="font-medium">No officers found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(o => (
            <Card
              key={o.id}
              className={cn(
                "card-hover cursor-pointer transition-all hover:border-primary/50 hover:shadow-md relative group",
                !o.is_active && "opacity-60"
              )}
              onClick={() => handleOpenOfficer(o)}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 group-hover:ring-2 group-hover:ring-primary/40 transition">
                    {o.photo_url ? <AvatarImage src={o.photo_url} className="object-cover" /> : <AvatarFallback className="text-xs">{initials(o.full_name)}</AvatarFallback>}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">{o.full_name ?? "Unnamed officer"}</p>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {o.oscar && <Badge variant="secondary" className="text-[9px]">{o.oscar}</Badge>}
                      {o.team && <Badge variant="outline" className="border-primary/40 text-[9px] uppercase text-primary">{o.team}</Badge>}
                      {!o.is_active && <Badge variant="outline" className="text-[9px] text-muted-foreground">Inactive</Badge>}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  {o.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> {o.email}</p>}
                  {o.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> {o.phone}</p>}
                  {o.birth_month && o.birth_day && (
                    <p className="flex items-center gap-1.5"><Cake className="h-3 w-3 shrink-0" /> {MONTH_NAMES[o.birth_month - 1]} {o.birth_day}</p>
                  )}
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full Officer Profile Dialog */}
      <OfficerProfileDialog
        officer={selectedOfficer}
        open={!!selectedOfficer}
        onOpenChange={(open) => {
          if (!open) setSelectedOfficer(null)
        }}
        canManage={canManage}
      />
    </div>
  )
}

