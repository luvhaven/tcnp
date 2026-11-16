"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart3, Boxes, CalendarDays, ClipboardCheck, ClipboardList, FileText, FolderOpen, Home,
  LayoutDashboard, MapPin, Store, Users, UtensilsCrossed, type LucideIcon,
} from "lucide-react"
import { DenProgrammeProvider } from "@/components/den/ChooseProgramme"
import DenGuide from "@/components/den/DenGuide"
import DenLocations, { type DenProgram } from "@/components/den/DenLocations"
import DenMenus from "@/components/den/DenMenus"
import DenGuests from "@/components/den/DenGuests"
import DenInventory from "@/components/den/DenInventory"
import DenOverview from "@/components/den/DenOverview"
import DenPlan from "@/components/den/DenPlan"
import DenReports from "@/components/den/DenReports"
import DenRepository from "@/components/den/DenRepository"
import DenRoster from "@/components/den/DenRoster"
import DenWork from "@/components/den/DenWork"
import PapaMealOrders from "@/components/den/PapaMealOrders"
import VendorDirectory from "@/components/den/VendorDirectory"
import { OfficerProfileDialog, type OfficerProfileData } from "@/components/officers/OfficerProfileDialog"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import type { DenTeamMember } from "@/hooks/useDenTeam"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { DEN_FLOOR_GRANTS_KEY, DEN_TABS, hasFloorAccessFor, resolveDenProgramme, resolveDenTab, type DenTab } from "@/lib/den"
import { createClient } from "@/lib/supabase/client"
import { canManageNoscarDen, canManageWelfare, isAdmin } from "@/lib/utils"

// The dashboard is the only tab that draws charts, so its chart library is
// loaded when that tab is first opened rather than with the page.
const DenDashboard = dynamic(() => import("@/components/den/DenDashboard"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-2xl" />,
})

const TAB_LABEL: Record<DenTab, string> = {
  overview: "Overview",
  dashboard: "Dashboard",
  plan: "Programme plan",
  work: "Tasks & Checklists",
  roster: "Roster",
  guests: "Guests",
  service: "Menus & Orders",
  vendors: "Vendors",
  inventory: "Inventory",
  locations: "Locations",
  repository: "Repository",
  reports: "Reports",
}

const TAB_ICON: Record<DenTab, LucideIcon> = {
  overview: LayoutDashboard,
  dashboard: BarChart3,
  plan: ClipboardCheck,
  work: ClipboardList,
  roster: CalendarDays,
  guests: Users,
  service: UtensilsCrossed,
  vendors: Store,
  inventory: Boxes,
  locations: MapPin,
  repository: FolderOpen,
  reports: FileText,
}

const BRIEFING_ROLES = ["noscar_nest", "head_noscar_nest", "noscar_den", "head_noscar_den", "november_oscar"]

function toProfile(member: DenTeamMember): OfficerProfileData {
  return {
    id: member.id,
    email: member.email ?? "",
    full_name: member.full_name,
    phone: member.phone,
    oscar: member.oscar,
    role: member.role,
    unit: member.unit,
    current_title_id: member.current_title_id,
    is_active: member.is_active,
    activation_status: member.activation_status,
    photo_url: member.photo_url,
    created_at: member.created_at,
  }
}

export default function DenClient({ initialDens, initialTab, initialProgramme }: { initialDens: any[]; initialTab: string | null; initialProgramme: string | null }) {
  const supabase = createClient()
  const { data: currentUser } = useCurrentUser()
  const denUnit = useUnitAccess("november_den")

  const [chosenProgram, setChosenProgram] = useState<string | null>(initialProgramme)
  const [profile, setProfile] = useState<OfficerProfileData | null>(null)

  const { data: programs = [], isSuccess: programsLoaded } = useQuery({
    // Same shape (id, name, status) as OfficersClient's programs query, so
    // it's safe to share this key — see ProgramsClient.tsx for why pages
    // with DIFFERENT select() shapes must not share the bare ['programs'] key.
    queryKey: ["programs", "lite-status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name, status").order("name")
      if (error) throw error
      return data as DenProgram[]
    },
  })
  const selectedProgram = resolveDenProgramme(chosenProgram, programs, programsLoaded)

  const role = currentUser?.role ?? null
  const oscar = currentUser?.oscar ?? null
  const hasAdminAccess = currentUser?.has_admin_access ?? false

  // Admins and command keep everything they already had. The unit check only
  // ever adds the Den head on top; it never takes access away from anyone.
  const canManage = canManageNoscarDen(role, oscar, hasAdminAccess)
  const canManageVendors = canManageWelfare(role, oscar, hasAdminAccess)
  // Floor work (publishing menus, taking a Papa's order) reaches other Den
  // officers one programme at a time: they must be active for the programme
  // and the Den head must have switched them on for it (DenFloorAccess).
  const { data: floorPrograms = [] } = useQuery({
    queryKey: [...DEN_FLOOR_GRANTS_KEY, "mine", currentUser?.id],
    enabled: Boolean(currentUser?.id) && denUnit.isMember,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("den_floor_grants")
        .select("program_id")
        .eq("user_id", currentUser!.id)
      // Before the grants table exists there is simply nothing granted.
      if (error) return [] as string[]
      return (data ?? []).map((row: { program_id: string }) => row.program_id) as string[]
    },
  })
  const hasFloorAccess = hasFloorAccessFor(floorPrograms, selectedProgram)
  const canEditMenus = canManageVendors || hasFloorAccess
  const canTakeOrders = canManage || hasFloorAccess
  const canManageTeam = denUnit.canManage
  const showBriefings = Boolean(role && BRIEFING_ROLES.includes(role))

  const tabs = DEN_TABS
  const [requestedTab, setRequestedTab] = useState<string | null>(initialTab)
  const tab = resolveDenTab(requestedTab, tabs)

  // The tab and the programme live in the address bar, so a link, a refresh or
  // a notification lands on exactly this view — without a navigation (and
  // without re-running the server component).
  const writeAddress = (name: "tab" | "programme", value: string | null) => {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(name, value)
    else url.searchParams.delete(name)
    window.history.replaceState(null, "", url)
  }
  const selectTab = (next: string) => {
    setRequestedTab(next)
    writeAddress("tab", next === "overview" ? null : next)
  }
  const selectProgram = (next: string) => {
    setChosenProgram(next)
    writeAddress("programme", next)
  }

  // On a phone the tabs are one swipeable row; keep the open one in sight.
  const tabListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = tabListRef.current
    const active = list?.querySelector<HTMLElement>('[data-state="active"]')
    if (!list || !active || list.scrollWidth <= list.clientWidth) return
    // Measured against the row itself and set directly: an animated scroll is
    // cancelled when the tab takes focus, and never runs in a background tab.
    const target = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft
      - (list.clientWidth - active.offsetWidth) / 2
    list.scrollLeft = Math.max(0, target)
  }, [tab])

  const { data: dens = [] } = useQuery({
    queryKey: ["nests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nests").select("*, programs(name)").order("name")
      if (error) throw error
      return data as any[]
    },
    initialData: initialDens,
  })

  const programName = selectedProgram === "all"
    ? null
    : programs.find(program => program.id === selectedProgram)?.name ?? null
  const openProfile = (member: DenTeamMember) => setProfile(toProfile(member))

  return (
    <DenProgrammeProvider value={{ programs, loaded: programsLoaded, select: selectProgram }}>
    <div className="space-y-5 page-enter">
      <PageHeader
        icon={Home}
        title="November (Den)"
        badge="VIP Lounge & Den"
        description="Guest hospitality in one place: plan the programme, run the floor, keep what was learned."
        // The programme is the page's one global control, so it sits with the
        // title: beside it on wide screens, directly under it on a phone.
        actions={
          // On a phone the picker gets the whole row and the guide sits under it.
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-2 sm:order-2 sm:w-auto">
              <Label htmlFor="den-program-filter" className="shrink-0 text-sm text-muted-foreground">Programme</Label>
              <Select value={selectedProgram} onValueChange={selectProgram}>
                <SelectTrigger id="den-program-filter" className="min-w-0 flex-1 sm:w-[260px] sm:flex-none">
                  <SelectValue placeholder="All programmes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programmes</SelectItem>
                  {programs.map(program => (
                    <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="-ml-3 sm:order-1 sm:ml-0">
              <DenGuide isLead={denUnit.canCoordinate} />
            </div>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={selectTab} className="space-y-4">
        {/* A phone gets one swipeable row (the open tab is kept in view, and
            the row bleeds to the screen edge so it reads as scrollable);
            from tablet width up every tab is visible and they wrap. */}
        <TabsList
          ref={tabListRef}
          aria-label="November (Den) sections"
          className="-mx-4 flex w-auto justify-start gap-1 rounded-none px-4 [scrollbar-width:none] sm:mx-0 sm:h-auto sm:w-full sm:flex-wrap sm:rounded-lg sm:px-1 [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map(value => {
            const Icon = TAB_ICON[value]
            return (
              <TabsTrigger key={value} value={value} className="gap-1.5 px-3 py-2 sm:py-1.5">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {TAB_LABEL[value]}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="overview">
          <DenOverview
            dens={dens}
            selectedProgram={selectedProgram}
            programName={programName}
            canManageTeam={canManageTeam}
            onNavigate={selectTab}
            onOpenProfile={openProfile}
            currentUserId={currentUser?.id ?? null}
          />
        </TabsContent>

        <TabsContent value="service">
          <div className="space-y-6">
            <DenMenus canEdit={canEditMenus} selectedProgram={selectedProgram} currentUserId={currentUser?.id ?? null} />
            <PapaMealOrders canOrder={canTakeOrders} selectedProgram={selectedProgram} currentUserId={currentUser?.id ?? null} />
          </div>
        </TabsContent>

        <TabsContent value="vendors">
          <VendorDirectory
            canEdit={canManageVendors || denUnit.canManage}
            canRate={denUnit.isMember}
            currentUserId={currentUser?.id ?? null}
            programs={programs}
            selectedProgram={selectedProgram}
          />
        </TabsContent>

        <TabsContent value="inventory">
          <DenInventory
            selectedProgram={selectedProgram}
            programName={programName}
            canManage={denUnit.canManage}
            canCoordinate={denUnit.canCoordinate}
            isMember={denUnit.isMember}
            currentUserId={currentUser?.id ?? null}
          />
        </TabsContent>

        <TabsContent value="locations">
          <DenLocations
            dens={dens}
            programs={programs}
            selectedProgram={selectedProgram}
            canManage={canManage}
            onOpenProfile={openProfile}
          />
        </TabsContent>

        <TabsContent value="dashboard">
          <DenDashboard onNavigate={selectTab} />
        </TabsContent>

        <TabsContent value="plan">
          <DenPlan
            selectedProgram={selectedProgram}
            programName={programName}
            canCoordinate={denUnit.canCoordinate}
            canArchive={denUnit.canManage}
            currentUserId={currentUser?.id ?? null}
            onNavigate={selectTab}
          />
        </TabsContent>

        <TabsContent value="repository">
          <DenRepository
            canManage={denUnit.canManage}
            currentUserId={currentUser?.id ?? null}
            selectedProgram={selectedProgram}
            programName={programName}
          />
        </TabsContent>

        <TabsContent value="reports">
          <DenReports
            selectedProgram={selectedProgram}
            programName={programName}
            programs={programs}
            canCoordinate={denUnit.canCoordinate}
            canManage={denUnit.canManage}
            isMember={denUnit.isMember}
            currentUserId={currentUser?.id ?? null}
          />
        </TabsContent>

        <TabsContent value="work">
          <DenWork
            selectedProgram={selectedProgram}
            programName={programName}
            canCoordinate={denUnit.canCoordinate}
            canManage={denUnit.canManage}
            currentUserId={currentUser?.id ?? null}
          />
        </TabsContent>

        <TabsContent value="roster">
          <DenRoster
            selectedProgram={selectedProgram}
            programName={programName}
            dens={dens}
            canCoordinate={denUnit.canCoordinate}
            currentUserId={currentUser?.id ?? null}
          />
        </TabsContent>

        <TabsContent value="guests">
          <div className="space-y-6">
            <DenGuests
              selectedProgram={selectedProgram}
              programName={programName}
              currentUserId={currentUser?.id ?? null}
              canManage={denUnit.canManage}
            />
            {showBriefings && role && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <PapaBriefingsSection role={role} />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <OfficerProfileDialog
        officer={profile}
        open={Boolean(profile)}
        onOpenChange={(open) => { if (!open) setProfile(null) }}
        canManage={Boolean(currentUser && (isAdmin(currentUser.role, currentUser.has_admin_access) || isAdmin(currentUser.oscar)))}
      />
    </div>
    </DenProgrammeProvider>
  )
}
