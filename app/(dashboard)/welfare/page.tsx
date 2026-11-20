"use client"

import { Suspense, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { notifyError, UserFacingError } from '@/lib/notify'
import { createClient } from "@/lib/supabase/client"
import { useCanWorkUnitProgramme, useUnitAccess } from "@/hooks/useUnitAccess"
import { useProgrammeStanding } from "@/hooks/useProgrammeStanding"
import {
  canDeleteMenus, canEditMenus, canSeeWelfareDirectory, canSoundFoodAlarm, mayBeFoodAlarmWorker, programmeWorkNotice,
} from "@/lib/site-unit-permissions"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
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
import BirthdayReminder from "@/components/welfare/BirthdayReminder"
import WelfareOperations from "@/components/welfare/WelfareOperations"
import { Skeleton } from "@/components/ui/skeleton"
import UnitTasks from "@/components/units/UnitTasks"
import UnitProgrammeTeam from "@/components/units/UnitProgrammeTeam"
import { canSeeUnitWork, useAddressTab } from "@/components/units/unit-work-tabs"
import { UtensilsCrossed, BellRing, Loader2, HeartHandshake, Users, ClipboardList, UsersRound } from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

export default function WelfarePage() {
  // useSearchParams (?tab=) needs a Suspense boundary so the page can still prerender.
  return (
    <Suspense fallback={<WelfareSkeleton />}>
      <WelfareContent />
    </Suspense>
  )
}

function WelfareSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading Welfare">
      <Skeleton className="h-8 w-48 max-w-full" />
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function WelfareContent() {
  const queryClient = useQueryClient()
  // One rule: unit access comes from membership only. Each flag mirrors the
  // policy (or API rule) that judges the write. Admin and Command keep all of it.
  const welfare = useUnitAccess("welfare")
  const den = useUnitAccess("november_den")
  const nest = useUnitAccess("november_nest")
  const currentUser = welfare.currentUser

  const [alarmOpen, setAlarmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [alarmProgram, setAlarmProgram] = useState("")
  const [alarmNote, setAlarmNote] = useState("")
  const [filterProgram, setFilterProgram] = useState("all")

  const { data: programs = [], isError: programsFailed, isLoading: programsLoading } = useQuery({
    queryKey: ["programs-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name, status").order("created_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const activeProgram = programs.find((p: any) => p.status === "active")

  // Menus: program_menus insert/update for the programme in the filter.
  const menuProgramme = filterProgram === "all" ? null : filterProgram
  const welfareMenuWork = useCanWorkUnitProgramme("welfare", welfare.isMember ? menuProgramme : null)
  const denMenuWork = useCanWorkUnitProgramme("november_den", den.isMember ? menuProgramme : null)
  const menuUnits = { den, nest, welfare }
  const canEdit = canEditMenus(menuUnits, { welfare: welfareMenuWork.canWork, den: denMenuWork.canWork })
  const canDelete = canDeleteMenus(menuUnits)
  const canSeeDirectory = canSeeWelfareDirectory(welfare)
  // Tasks and Programme team: Welfare members and Command (the components decide who edits).
  const canSeeWork = canSeeUnitWork(welfare)
  const pageTabs = (["menus"] as string[]).concat(canSeeDirectory ? ["directory"] : [], canSeeWork ? ["tasks", "team"] : [])
  const [pageTab, selectPageTab] = useAddressTab(pageTabs)

  // Food alarm: the API allows Command, Welfare / Den coordinators, and Welfare
  // or Den members who may work the programme the alarm is sent for.
  const alarmUnits = { den, welfare }
  const alarmCoordinator = canSoundFoodAlarm(alarmUnits, {})
  // The same programme sendFoodAlarm posts (the chosen one, else the active one).
  const alarmTarget: string = alarmProgram || activeProgram?.id || ""
  const welfareAlarmWork = useCanWorkUnitProgramme("welfare", !alarmCoordinator && welfare.isMember ? alarmTarget || null : null)
  const denAlarmWork = useCanWorkUnitProgramme("november_den", !alarmCoordinator && den.isMember ? alarmTarget || null : null)
  const canSendAlarm = canSoundFoodAlarm(alarmUnits, { welfare: welfareAlarmWork.canWork, den: denAlarmWork.canWork })
  // A member who may be given programme work sees the button, and the dialog
  // says why sending is off for a programme they cannot work.
  const showAlarmButton = alarmCoordinator || mayBeFoodAlarmWorker(alarmUnits)
  const alarmMemberAccess = welfare.isMember ? welfare : den
  const { activeOnProgramme: activeOnAlarmProgramme } = useProgrammeStanding(alarmTarget || null, !alarmCoordinator && showAlarmButton)
  const alarmNotice = alarmCoordinator ? null : programmeWorkNotice({
    access: alarmMemberAccess,
    programmeSelected: Boolean(alarmTarget),
    activeOnProgramme: activeOnAlarmProgramme,
    workLoading: welfareAlarmWork.isLoading || denAlarmWork.isLoading,
    workFailed: welfareAlarmWork.loadFailed || denAlarmWork.loadFailed,
    canWork: canSendAlarm,
    work: "sound the food alarm",
    granter: "your unit head",
  })

  const sendFoodAlarm = async () => {
    setSending(true)
    try {
      const res = await fetch("/api/welfare/food-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: alarmTarget || null, note: alarmNote.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new UserFacingError(data.error || "Failed to send alarm")
      toast.success(`Food alarm sent to ${data.recipients} officer${data.recipients === 1 ? "" : "s"} 🍽️`)
      setAlarmOpen(false)
      setAlarmNote("")
    } catch (err: any) {
      notifyError(err, "Failed to send alarm")
    } finally {
      setSending(false)
    }
  }

  // One program filter + menu list, shared by both layouts (with and without the directory tab).
  const menusSection = (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Label htmlFor="welfare-menu-program" className="text-sm text-muted-foreground">Menus for program:</Label>
        <Select value={filterProgram} onValueChange={setFilterProgram}>
          <SelectTrigger id="welfare-menu-program" className="h-9 w-full sm:w-[220px]"><SelectValue placeholder="All Programs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {/* Menus (shared with November (Den)) */}
      <DenMenus canEdit={canEdit} canDelete={canDelete} selectedProgram={filterProgram} currentUserId={currentUser?.id ?? null} />
    </>
  )

  return (
    <div className="space-y-6 page-enter">
      {/* Modal only — renders nothing inline until a birthday prompt opens. */}
      <BirthdayReminder />

      {/* Header */}
      <PageHeader
        icon={HeartHandshake}
        title="Welfare"
        badge="Meals & Officer Care"
        description="Menu of the day, program meal plans — and the famous Food-is-Ready alarm."
        actions={showAlarmButton && (
          <Button className="min-h-11 sm:min-h-9" onClick={() => { setAlarmProgram(activeProgram?.id ?? ""); setAlarmOpen(true) }} disabled={programsLoading || programsFailed} title={programsFailed ? "Programs couldn't load, so the alarm can't be targeted. Refresh and try again." : undefined}>
            <BellRing aria-hidden="true" /> Food is Ready
          </Button>
        )}
      />

      {welfare.loadFailed && (
        <ErrorState
          title="Could not check your unit access"
          description="Welfare controls stay hidden until your membership loads."
          onRetry={() => { void queryClient.invalidateQueries({ queryKey: ["unit-access"] }) }}
          className="rounded-2xl border"
        />
      )}

      <WelfareOperations />

      {pageTabs.length > 1 ? (
        <Tabs value={pageTab} onValueChange={selectPageTab} className="space-y-4">
          <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-auto">
            <TabsTrigger value="menus" className="min-h-10"><UtensilsCrossed className="mr-2 h-4 w-4" aria-hidden="true" />Menus</TabsTrigger>
            {canSeeDirectory && (
              <TabsTrigger value="directory" className="min-h-10"><Users className="mr-2 h-4 w-4" aria-hidden="true" />Officer Directory</TabsTrigger>
            )}
            {canSeeWork && (
              <>
                <TabsTrigger value="tasks" className="min-h-10"><ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />Tasks</TabsTrigger>
                <TabsTrigger value="team" className="min-h-10"><UsersRound className="mr-2 h-4 w-4" aria-hidden="true" />Programme team</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="menus" className="space-y-4">
            {menusSection}
          </TabsContent>

          {canSeeDirectory && (
            <TabsContent value="directory">
              <WelfareOfficerDirectory />
            </TabsContent>
          )}

          {canSeeWork && (
            <>
              <TabsContent value="tasks">
                <UnitTasks unitSlug="welfare" />
              </TabsContent>
              <TabsContent value="team">
                <UnitProgrammeTeam unitSlug="welfare" />
              </TabsContent>
            </>
          )}
        </Tabs>
      ) : (
        <div className="space-y-4">{menusSection}</div>
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
              <Label htmlFor="food-alarm-note">Note (optional)</Label>
              <Textarea id="food-alarm-note" rows={2} value={alarmNote} onChange={(e) => setAlarmNote(e.target.value)} placeholder="e.g. Serving at the Den, west wing" />
            </div>
            {alarmNotice && (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                {alarmNotice}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-11 flex-1 sm:min-h-9" onClick={() => setAlarmOpen(false)}>Cancel</Button>
              <Button className="min-h-11 flex-1 gap-2 bg-amber-600 hover:bg-amber-500 sm:min-h-9" onClick={sendFoodAlarm} disabled={sending || !canSendAlarm}>
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
