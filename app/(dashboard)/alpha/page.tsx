"use client"

import { useReloadOnDeletion } from "@/hooks/useDashboardDeletions"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import AOArrivalTimeline from "@/components/eagles/AOArrivalTimeline"
import FlightSearch from "@/components/eagles/FlightSearch"
import PapaFlightMonitor from "@/components/aviation/PapaFlightMonitor"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plane, Plus, Edit, Trash2, MapPin, ClipboardList, Users } from "lucide-react"
import { toast } from "sonner"
import { notifyError } from '@/lib/notify'
import { useUnitAccess } from "@/hooks/useUnitAccess"
import UnitTasks from "@/components/units/UnitTasks"
import UnitProgrammeTeam from "@/components/units/UnitProgrammeTeam"
import { canSeeUnitWork, isUnitWorkTab } from "@/components/units/unit-work-tabs"

type AlphaTab = 'squares' | 'tracking' | 'timeline' | 'tasks' | 'team'

/** The tab named in the address bar, when this officer can open it. */
function resolveAlphaTab(requested: string | null | undefined, canSeeTimeline: boolean, canSeeWork = false): AlphaTab {
    if (requested === 'tracking') return 'tracking'
    if (requested === 'timeline' && canSeeTimeline) return 'timeline'
    if (isUnitWorkTab(requested, canSeeWork)) return requested
    return 'squares'
}

/**
 * Briefing config from the officer's Alpha level, not their role or Oscar:
 * the head and Sub-Team Leads (and platform admins) get the editable config,
 * other Alpha members the read-only one, everyone else none.
 */
function alphaBriefingRole(access: { canCoordinate: boolean; isMember: boolean }): string | null {
    if (access.canCoordinate) return 'head_alpha_oscar'
    if (access.isMember) return 'alpha_oscar'
    return null
}

/** Keeps a view setting in the address bar without a navigation. */
function writeAddress(values: Record<string, string | null>) {
    const url = new URL(window.location.href)
    for (const [name, value] of Object.entries(values)) {
        if (value) url.searchParams.set(name, value)
        else url.searchParams.delete(name)
    }
    window.history.replaceState(null, "", url)
}

export default function EaglesPage() {
    // useSearchParams needs a Suspense boundary so the page can still prerender.
    return (
        <Suspense fallback={<AlphaSkeleton />}>
            <AlphaContent />
        </Suspense>
    )
}

function AlphaSkeleton() {
    return (
        <div className="space-y-6" role="status" aria-label="Loading Alpha">
            <Skeleton className="h-8 w-48 max-w-full" />
            <Skeleton className="h-11 w-full max-w-md" />
            <Skeleton className="h-40 w-full" />
        </div>
    )
}

function AlphaContent() {
    const params = useSearchParams()
    const queryClient = useQueryClient()
    const alpha = useUnitAccess('alpha')
    const command = useUnitAccess('command')
    // Matches the timeline read policy: admin/Command, Alpha or Command members.
    const canSeeTimeline = alpha.isMember || alpha.isCommand || command.isMember
    // Eagle Squares RLS: is_admin() OR can_manage_unit('alpha').
    const canManageSquares = alpha.canManage || alpha.isCommand
    // Tasks and Programme team: Alpha members and Command (the components decide who edits).
    const canSeeWork = canSeeUnitWork(alpha)
    const briefingRole = alphaBriefingRole(alpha)

    // The address bar leads: a notification tap or back/forward that changes
    // ?tab= while the page stays mounted moves the tab with it. A tab click
    // is shown at once and written back with replaceState.
    const addressTab = params.get('tab')
    const [requestedTab, setRequestedTab] = useState<string | null>(addressTab)
    const [seenAddressTab, setSeenAddressTab] = useState<string | null>(addressTab)
    if (seenAddressTab !== addressTab) {
        setSeenAddressTab(addressTab)
        setRequestedTab(addressTab)
    }
    const tab = resolveAlphaTab(requestedTab, canSeeTimeline, canSeeWork)
    const selectTab = (next: string) => {
        setRequestedTab(next)
        writeAddress({ tab: next === 'squares' ? null : next })
    }

    return (
        <div className="space-y-6 page-enter">
            <PageHeader
                icon={Plane}
                title="Alpha"
                badge="Eagle Squares & Aviation"
                description="Airport hubs, VIP tarmac reception, and live flight telemetry."
            />

            {(alpha.loadFailed || command.loadFailed) && (
                <Card>
                    <ErrorState
                        title="We couldn't confirm your unit access"
                        description="Alpha controls stay hidden until it loads. Check your connection and try again."
                        onRetry={() => { void queryClient.invalidateQueries({ queryKey: ['unit-access'] }) }}
                    />
                </Card>
            )}

            {/* Papa arrival briefings: read-only for Alpha members, editable for the head. */}
            {briefingRole && (
                <div className="border rounded-xl p-4 bg-muted/30">
                    <PapaBriefingsSection role={briefingRole} />
                </div>
            )}

            <Tabs value={tab} onValueChange={selectTab} className="space-y-6">
                <TabsList className={canSeeWork
                    ? `grid h-auto w-full grid-cols-3 gap-1 p-1 ${canSeeTimeline ? 'sm:grid-cols-5 max-w-4xl' : 'sm:grid-cols-4 max-w-3xl'}`
                    : canSeeTimeline ? "grid w-full grid-cols-3 max-w-xl" : "grid w-full grid-cols-2 max-w-md"}>
                    <TabsTrigger value="squares" className="min-h-11 min-w-0 whitespace-normal text-center text-xs sm:text-sm">Eagle Squares</TabsTrigger>
                    <TabsTrigger value="tracking" className="min-h-11 min-w-0 whitespace-normal text-center text-xs sm:text-sm">Flight Tracking</TabsTrigger>
                    {canSeeTimeline && (
                        <TabsTrigger value="timeline" className="min-h-11 min-w-0 whitespace-normal text-center text-xs sm:text-sm">Arrival Timeline</TabsTrigger>
                    )}
                    {canSeeWork && (
                        <>
                            <TabsTrigger value="tasks" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-center text-xs sm:text-sm"><ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Tasks</TabsTrigger>
                            <TabsTrigger value="team" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-center text-xs sm:text-sm"><Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Programme team</TabsTrigger>
                        </>
                    )}
                </TabsList>

                <TabsContent value="squares" className="space-y-6">
                    <ManageSquares canManage={canManageSquares} />
                </TabsContent>

                <TabsContent value="tracking" className="space-y-6">
                    <FlightSearch />
                    <PapaFlightMonitor
                        title="Alpha Papa flight watch"
                        description="Exact, itinerary-scoped OpenSky tracking for Papa arrivals. Schedule estimates are never presented as confirmed live positions."
                    />
                </TabsContent>

                {canSeeTimeline && (
                    <TabsContent value="timeline" className="space-y-6">
                        <AOArrivalTimeline
                            access={{
                                loadFailed: alpha.loadFailed,
                                isMember: alpha.isMember,
                                isCommand: alpha.isCommand,
                                isCommandMember: command.isMember,
                                canCoordinate: alpha.canCoordinate,
                            }}
                            initialProgrammeId={params.get('programme')}
                            initialPapaId={params.get('papa')}
                            onSelectionChange={({ programme, papa }) => writeAddress({ programme, papa })}
                        />
                    </TabsContent>
                )}

                {canSeeWork && (
                    <>
                        <TabsContent value="tasks" className="space-y-6">
                            <UnitTasks unitSlug="alpha" />
                        </TabsContent>
                        <TabsContent value="team" className="space-y-6">
                            <UnitProgrammeTeam unitSlug="alpha" />
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </div>
    )
}

function ManageSquares({ canManage }: { canManage: boolean }) {
    const supabase = createClient()
    const confirm = useConfirm()
    const [airports, setAirports] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [loadFailed, setLoadFailed] = useState(false)
    const [retrying, setRetrying] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState<any>(null)
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        city: '',
        country: '',
        latitude: '',
        longitude: '',
        contact: '',
        notes: ''
    })

    useEffect(() => {
        loadAirports()
    }, [])

    useReloadOnDeletion(['eagle_squares'], () => { void loadAirports() })

    const loadAirports = async () => {
        try {
            const { data, error } = await supabase
                .from('eagle_squares')
                .select('*')
                .order('name')

            if (error) throw error
            setAirports(data || [])
            setLoadFailed(false)
        } catch (error) {
            console.error('Error loading airports:', error)
            setLoadFailed(true)
            // The list keeps any airports already shown; only say so then,
            // since an empty list is replaced by the error panel below.
            if (airports.length > 0) toast.error('Failed to load airports')
        } finally {
            setLoading(false)
        }
    }

    const retryLoad = async () => {
        setRetrying(true)
        await loadAirports()
        setRetrying(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (saving) return
        setSaving(true)
        try {
            const data = {
                ...formData,
                latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                longitude: formData.longitude ? parseFloat(formData.longitude) : null,
            }

            if (editing) {
                const { error } = await supabase
                    .from('eagle_squares')
                    .update(data)
                    .eq('id', editing.id)

                if (error) throw error
                toast.success('Airport updated successfully')
            } else {
                const { error } = await supabase
                    .from('eagle_squares')
                    .insert([data])

                if (error) throw error
                toast.success('Airport added successfully')
            }

            setDialogOpen(false)
            setEditing(null)
            resetForm()
            loadAirports()
        } catch (error: any) {
            console.error('Error saving airport:', error)
            notifyError(error, 'Failed to save airport')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!await confirm({ message: 'Are you sure you want to delete this airport?', variant: 'destructive' })) return

        try {
            const { error } = await supabase
                .from('eagle_squares')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success('Airport deleted successfully')
            loadAirports()
        } catch (error: any) {
            console.error('Error deleting airport:', error)
            notifyError(error, 'Failed to delete airport')
        }
    }

    const handleEdit = (airport: any) => {
        setEditing(airport)
        setFormData({
            name: airport.name || '',
            code: airport.code || '',
            city: airport.city || '',
            country: airport.country || '',
            latitude: airport.latitude?.toString() || '',
            longitude: airport.longitude?.toString() || '',
            contact: airport.contact || '',
            notes: airport.notes || ''
        })
        setDialogOpen(true)
    }

    const resetForm = () => {
        setFormData({
            name: '',
            code: '',
            city: '',
            country: '',
            latitude: '',
            longitude: '',
            contact: '',
            notes: ''
        })
    }

    if (loading) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-bold sm:text-2xl">Airport Management</h2>
                    <p className="text-sm text-muted-foreground">Manage Eagle Square locations</p>
                </div>
                {canManage && (
                    <Button className="w-full shrink-0 sm:w-auto" onClick={() => { resetForm(); setEditing(null); setDialogOpen(true) }}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Airport
                    </Button>
                )}
            </div>

            {loadFailed && airports.length === 0 ? (
                <Card>
                    <ErrorState
                        title="We couldn't load the airports"
                        description="Check your connection and try again."
                        onRetry={() => { void retryLoad() }}
                        retrying={retrying}
                    />
                </Card>
            ) : airports.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Plane className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold mb-2">No Airports Yet</p>
                        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                            {canManage
                                ? 'Add your first airport to start tracking Eagle operations.'
                                : 'Airports added by the Alpha team will appear here.'}
                        </p>
                        {canManage && (
                            <Button onClick={() => { resetForm(); setEditing(null); setDialogOpen(true) }}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Airport
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {airports.map((airport) => (
                        <Card key={airport.id} className="group hover:shadow-lg hover:border-primary/40 transition-all duration-300">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="min-w-0 flex-1">
                                        <CardTitle className="flex items-center gap-2 break-words">
                                            <Plane className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                                            {airport.name}
                                        </CardTitle>
                                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                                            <Badge variant="secondary">{airport.code}</Badge>
                                            <span className="text-sm text-muted-foreground">
                                                {airport.city}, {airport.country}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 text-sm">
                                    {airport.latitude && airport.longitude && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <MapPin className="h-4 w-4" />
                                            <span className="font-mono text-xs">
                                                {airport.latitude.toFixed(4)}, {airport.longitude.toFixed(4)}
                                            </span>
                                        </div>
                                    )}
                                    {airport.contact && (
                                        <p className="text-muted-foreground">Contact: {airport.contact}</p>
                                    )}
                                    {airport.notes && (
                                        <p className="text-muted-foreground text-xs italic">{airport.notes}</p>
                                    )}
                                </div>
                                {canManage && (
                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEdit(airport)}
                                            className="flex-1"
                                            aria-label={`Edit ${airport.name || 'airport'}`}
                                        >
                                            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                                            Edit
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(airport.id)}
                                            aria-label={`Delete ${airport.name || 'airport'}`}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Airport' : 'Add New Airport'}</DialogTitle>
                        <DialogDescription>
                            {editing ? 'Update airport information' : 'Add a new airport to the system'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Airport Name *</Label>
                                <Input
                                    id="name"
                                    required
                                    placeholder="e.g., Nnamdi Azikiwe International"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="code">Airport Code *</Label>
                                <Input
                                    id="code"
                                    required
                                    placeholder="e.g., ABV"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="city">City *</Label>
                                <Input
                                    id="city"
                                    required
                                    placeholder="e.g., Abuja"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="country">Country *</Label>
                                <Input
                                    id="country"
                                    required
                                    placeholder="e.g., Nigeria"
                                    value={formData.country}
                                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="latitude">Latitude</Label>
                                <Input
                                    id="latitude"
                                    type="number"
                                    step="any"
                                    placeholder="e.g., 9.0065"
                                    value={formData.latitude}
                                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="longitude">Longitude</Label>
                                <Input
                                    id="longitude"
                                    type="number"
                                    step="any"
                                    placeholder="e.g., 7.2631"
                                    value={formData.longitude}
                                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contact">Contact</Label>
                            <Input
                                id="contact"
                                placeholder="Contact person or phone number"
                                value={formData.contact}
                                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                placeholder="Additional information..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end space-x-2">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" pending={saving}>
                                {editing ? 'Update' : 'Add'} Airport
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
