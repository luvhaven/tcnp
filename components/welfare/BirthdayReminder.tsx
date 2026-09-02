"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Cake, PartyPopper, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { isPlatformAdministrator } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const supabase = createClient()
const MANAGER_ACCESS = new Set(["head", "head_of_unit", "manager", "admin"])

type BirthdayUser = { id: string; full_name: string | null }

function lagosNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  const year = value("year")
  const month = value("month")
  const day = value("day")
  return { dateKey: `${year}-${month}-${day}`, hour: Number(value("hour")) }
}

function initials(name: string | null) {
  if (!name) return "TC"
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}

export default function BirthdayReminder() {
  const { data: currentUser } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState(lagosNow)

  useEffect(() => {
    const timer = window.setInterval(() => setToday(lagosNow()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const welfareAccessQuery = useQuery({
    queryKey: ["birthday-reminder-access", currentUser?.id],
    enabled: Boolean(currentUser?.id && today.hour >= 7),
    queryFn: async () => {
      if (isPlatformAdministrator(currentUser?.role)) return true
      const { data: unit, error: unitError } = await (supabase as any).from("units").select("id").eq("slug", "welfare").maybeSingle()
      if (unitError) throw unitError
      if (!unit?.id) return false
      const { data, error } = await (supabase as any)
        .from("unit_memberships")
        .select("access_level, status")
        .eq("unit_id", unit.id)
        .eq("user_id", currentUser!.id)
        .eq("status", "active")
        .maybeSingle()
      if (error) throw error
      return Boolean(data && MANAGER_ACCESS.has(data.access_level))
    },
  })

  const birthdaysQuery = useQuery({
    queryKey: ["welfare-birthdays-today", today.dateKey],
    enabled: welfareAccessQuery.data === true && today.hour >= 7,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_today_birthdays").select("id, full_name")
      if (error) throw error
      return (data ?? []) as BirthdayUser[]
    },
  })

  const storageKey = currentUser?.id ? `tcnp:welfare-birthday-reminder:${currentUser.id}:${today.dateKey}` : null

  useEffect(() => {
    if (!storageKey || !birthdaysQuery.isSuccess || birthdaysQuery.data.length === 0) return
    try {
      if (window.localStorage.getItem(storageKey) !== "shown") setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [birthdaysQuery.data, birthdaysQuery.isSuccess, storageKey])

  const acknowledge = () => {
    if (storageKey) {
      try { window.localStorage.setItem(storageKey, "shown") } catch { /* The reminder can still close when storage is unavailable. */ }
    }
    setOpen(false)
  }

  const openCelebrations = () => {
    acknowledge()
    window.dispatchEvent(new CustomEvent("welfare-open-celebrations"))
    window.setTimeout(() => document.getElementById("welfare-operations")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }

  const birthdays = birthdaysQuery.data ?? []

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) acknowledge(); else setOpen(true) }}>
      <DialogContent className="overflow-hidden border-amber-500/20 p-0 sm:max-w-lg">
        <div className="relative bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(244,63,94,0.08),transparent)] px-6 pb-5 pt-7">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-amber-400/20 blur-3xl" />
          <DialogHeader className="relative text-left">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm"><Cake className="h-5 w-5" /></div>
              <Badge className="border-0 bg-amber-500/15 text-amber-800 dark:text-amber-200"><Sparkles className="mr-1 h-3 w-3" /> 7:00 AM Welfare prompt</Badge>
            </div>
            <DialogTitle className="text-2xl tracking-tight">There {birthdays.length === 1 ? "is a birthday" : "are birthdays"} to celebrate today.</DialogTitle>
            <DialogDescription className="max-w-md leading-6">Please prepare and share a warm message with the protocol family.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 pb-6">
          <div className="space-y-2">
            {birthdays.map((person) => (
              <div key={person.id} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-3">
                <Avatar className="h-10 w-10 border border-amber-500/20"><AvatarFallback className="bg-amber-500/10 text-sm font-semibold text-amber-700 dark:text-amber-300">{initials(person.full_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{person.full_name || "Protocol member"}</p><p className="text-xs text-muted-foreground">Celebrating today</p></div>
                <PartyPopper className="h-4 w-4 text-amber-500" />
              </div>
            ))}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={acknowledge}>Remind me tomorrow</Button><Button className="gap-2 bg-amber-600 text-white hover:bg-amber-500" onClick={openCelebrations}><Cake className="h-4 w-4" /> Prepare birthday post</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
