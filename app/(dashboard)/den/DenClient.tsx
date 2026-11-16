"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"
import { Home, Plus } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import type { DenTeamMember } from "@/hooks/useDenTeam"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { DEN_FLOOR_GRANTS_KEY, DEN_TABS, hasFloorAccessFor, resolveDenTab, type DenTab } from "@/lib/den"
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

export default function DenClient({ initialDens, initialTab }: { initialDens: any[]; initialTab: string | null }) {
  const supabase = createClient()
  const { data: currentUser } = useCurrentUser()
  const denUnit = useUnitAccess("november_den")

  const [selectedProgram, setSelectedProgram] = useState("all")
  const [profile, setProfile] = useState<OfficerProfileData | null>(null)
  const [addRequest, setAddRequest] = useState(0)

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

  const selectTab = (next: string) => {
    setRequestedTab(next)
    // Keep the tab in the address bar so a link or a refresh lands on it,
    // without a navigation (and without re-running the server component).
    const url = new URL(window.location.href)
    if (next === "overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url)
  }

  const { data: dens = [] } = useQuery({
    queryKey: ["nests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nests").select("*, programs(name)").order("name")
      if (error) throw error
      return data as any[]
    },
    initialData: initialDens,
  })

  const { data: programs = [] } = useQuery({
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

  const programName = selectedProgram === "all"
    ? null
    : programs.find(program => program.id === selectedProgram)?.name ?? null
  const openProfile = (member: DenTeamMember) => setProfile(toProfile(member))

  return (
    <div className="space-y-6 page-enter">
      <PageHeader
        icon={Home}
        title="November (Den)"
        badge="VIP Lounge & Den"
        description="Guest hospitality in one place: the team, today's menus and orders, vendors and Den locations."
        actions={canManage && (
          <Button onClick={() => { selectTab("locations"); setAddRequest(count => count + 1) }}>
            <Plus aria-hidden="true" />
            Add Den
          </Button>
        )}
      />

      <Tabs value={tab} onValueChange={selectTab} className="space-y-4">
        {/* The tabs need the full width: the filter sits on its own line above
            them, and the tabs wrap instead of hiding behind a scrollbar. */}
        <div className="flex flex-col gap-3">
          {/* Phones get one swipeable row; four wrapped rows would push the content off the first screen. */}
          <TabsList className="order-2 w-full justify-start sm:h-auto sm:flex-wrap">
            {tabs.map(value => (
              <TabsTrigger key={value} value={value}>{TAB_LABEL[value]}</TabsTrigger>
            ))}
          </TabsList>
          <div className="order-1 flex items-center gap-2">
            <Label htmlFor="den-program-filter" className="shrink-0 text-sm text-muted-foreground">Programme</Label>
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger id="den-program-filter" className="w-full sm:w-[280px]">
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
        </div>

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
            addRequest={addRequest}
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
  )
}
