"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canManageWelfare, canAccessWelfareDirectory } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import DenMenus from "@/components/den/DenMenus"
import WelfareOfficerDirectory from "@/components/welfare/WelfareOfficerDirectory"
import { UtensilsCrossed, BellRing, Loader2, HeartHandshake, Users } from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

export default function WelfarePage() {
  const { data: currentUser } = useCurrentUser()
  const canEdit = canManageWelfare(currentUser?.role, currentUser?.oscar)
  const canSeeDirectory = canAccessWelfareDirectory(currentUser?.role, currentUser?.oscar)

  const [alarmOpen, setAlarmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [alarmProgram, setAlarmProgram] = useState("")
  const [alarmNote, setAlarmNote] = useState("")
  const [filterProgram, setFilterProgram] = useState("all")

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      return data ?? []
    },
  })

  const activeProgram = programs.find((p: any) => p.status === "active")

  const sendFoodAlarm = async () => {
    setSending(true)
    try {
      const res = await fetch("/api/welfare/food-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: alarmProgram || activeProgram?.id || null, note: alarmNote.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send alarm")
      toast.success(`Food alarm sent to ${data.recipients} officer${data.recipients === 1 ? "" : "s"} 🍽️`)
      setAlarmOpen(false)
      setAlarmNote("")
    } catch (err: any) {
      toast.error(err.message || "Failed to send alarm")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-950 via-slate-900 to-slate-900 p-6 text-white">
        <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <HeartHandshake className="h-6 w-6 text-amber-300" />
              <h1 className="text-2xl font-bold tracking-tight">Welfare</h1>
              <Badge className="border-0 bg-amber-500/20 text-amber-200 uppercase text-[10px] tracking-wider">Meals & Officer Care</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-300">
              Menu of the day, program meal plans — and the famous Food-is-Ready alarm.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => { setAlarmProgram(activeProgram?.id ?? ""); setAlarmOpen(true) }} className="gap-2 bg-amber-600 hover:bg-amber-500">
              <BellRing className="h-4 w-4" /> Food is Ready
            </Button>
          )}
        </div>
      </div>

      {canSeeDirectory ? (
        <Tabs defaultValue="menus" className="space-y-4">
          <TabsList>
            <TabsTrigger value="menus"><UtensilsCrossed className="mr-2 h-4 w-4" />Menus</TabsTrigger>
            <TabsTrigger value="directory"><Users className="mr-2 h-4 w-4" />Officer Directory</TabsTrigger>
          </TabsList>

          <TabsContent value="menus" className="space-y-4">
            <div className="flex items-center gap-3">
              <Label className="text-sm text-muted-foreground">Program:</Label>
              <Select value={filterProgram} onValueChange={setFilterProgram}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="All Programs" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs</SelectItem>
                  {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DenMenus canEdit={canEdit} selectedProgram={filterProgram} currentUserId={currentUser?.id ?? null} />
          </TabsContent>

          <TabsContent value="directory">
            <WelfareOfficerDirectory />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {/* Program filter */}
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Program:</Label>
            <Select value={filterProgram} onValueChange={setFilterProgram}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="All Programs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Menus (shared with November (Den)) */}
          <DenMenus canEdit={canEdit} selectedProgram={filterProgram} currentUserId={currentUser?.id ?? null} />
        </>
      )}

      {/* Food alarm dialog */}
      <Dialog open={alarmOpen} onOpenChange={setAlarmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-amber-500" /> Sound the Food Alarm
            </DialogTitle>
            <DialogDescription>
              Sends a high-priority notification to every officer participating in the selected program today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Program</Label>
              <Select value={alarmProgram || "none"} onValueChange={(v) => setAlarmProgram(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All active officers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All active officers</SelectItem>
                  {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={alarmNote} onChange={(e) => setAlarmNote(e.target.value)} placeholder="e.g. Serving at the Den, west wing" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAlarmOpen(false)}>Cancel</Button>
              <Button className="flex-1 gap-2 bg-amber-600 hover:bg-amber-500" onClick={sendFoodAlarm} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                {sending ? "Sending…" : "Send Alarm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
