"use client"

import { useReloadOnDeletion } from "@/hooks/useDashboardDeletions"
import { Suspense, useEffect, useState, useCallback } from "react"
import EchoBriefings from "@/components/echo/EchoBriefings"
import EOChecklist from "@/components/echo/EOChecklist"
import { useEchoProgrammeWork } from "@/components/echo/useEchoProgrammeWork"
import UnitTasks from "@/components/units/UnitTasks"
import UnitProgrammeTeam from "@/components/units/UnitProgrammeTeam"
import { canSeeUnitWork, useAddressTab } from "@/components/units/unit-work-tabs"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { isPlatformAdministrator } from "@/lib/utils"
import { useUnitAccess } from "@/hooks/useUnitAccess"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { notifyError, UserFacingError } from '@/lib/notify'
import { ErrorState } from "@/components/ui/error-state"
import {
    Volume2,
    Plus,
    Edit,
    Trash2,
    Mic,
    Monitor,
    Camera,
    Lightbulb,
    Cable,
    Package,
    CheckCircle,
    AlertTriangle,
    Wrench,
    XCircle,
    RefreshCw,
    Search,
    Filter,
    ClipboardList,
    UsersRound
} from "lucide-react"

// Equipment types with icons
const EQUIPMENT_TYPES = [
    { value: 'sound', label: 'Sound Equipment', short: 'Sound', icon: Volume2 },
    { value: 'microphone', label: 'Microphones', short: 'Mics', icon: Mic },
    { value: 'presentation', label: 'Presentation', short: 'Screens', icon: Monitor },
    { value: 'camera', label: 'Cameras', short: 'Cameras', icon: Camera },
    { value: 'lighting', label: 'Lighting', short: 'Lights', icon: Lightbulb },
    { value: 'cables', label: 'Cables & Accessories', short: 'Cables', icon: Cable },
    { value: 'other', label: 'Other', short: 'Other', icon: Package },
]

const STATUS_CONFIG = {
    available: { label: 'Available', color: 'bg-green-500', icon: CheckCircle, textColor: 'text-green-700' },
    in_use: { label: 'In Use', color: 'bg-blue-500', icon: RefreshCw, textColor: 'text-blue-700' },
    maintenance: { label: 'Maintenance', color: 'bg-orange-500', icon: Wrench, textColor: 'text-orange-700' },
    damaged: { label: 'Damaged', color: 'bg-red-500', icon: AlertTriangle, textColor: 'text-red-700' },
    retired: { label: 'Retired', color: 'bg-gray-500', icon: XCircle, textColor: 'text-gray-700' },
}

type Equipment = {
    id: string
    program_id: string | null
    name: string
    type: string
    subtype: string | null
    quantity: number
    status: string
    assigned_to: string | null
    serial_number: string | null
    location: string | null
    additional_info: string | null
    last_checked_at: string | null
    created_at: string
    programs?: { name: string } | null
    assigned_user?: { full_name: string; oscar: string } | null
}

type Program = {
    id: string
    name: string
    status: string
}

const NOT_YOURS = 'You cannot change this item. It may belong to a programme you do not work on for Echo.'

// Non-unit roles in equipment_manage_authorized. Echo officers come in through
// Echo membership (can_coordinate_unit('echo')), never through a role or Oscar.
const ALLOWED_ROLES = [
    'super_admin', 'dev_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command',
]

export default function EchoPage() {
    // useSearchParams (?tab=) needs a Suspense boundary so the page can still prerender.
    return (
        <Suspense fallback={<EchoLoading />}>
            <EchoPageContent />
        </Suspense>
    )
}

function EchoLoading() {
    return (
        <div className="space-y-6" aria-busy="true" aria-label="Loading Echo">
            <div className="h-8 w-48 rounded-md skeleton" />
            <div className="h-96 rounded-lg skeleton" />
        </div>
    )
}

function EchoPageContent() {
    const supabase = createClient()
    const confirm = useConfirm()
    const [equipment, setEquipment] = useState<Equipment[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [loading, setLoading] = useState(true)
    const [loadFailed, setLoadFailed] = useState(false)
    const [retrying, setRetrying] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState<Equipment | null>(null)
    const [roleCanManage, setRoleCanManage] = useState(false)
    const queryClient = useQueryClient()
    const echoUnit = useUnitAccess('echo')
    // Equipment writes on every row (equipment_manage_authorized): the policy's
    // non-unit roles, or an Echo head/sub-lead. Admin and Command are never reduced.
    const canManage = roleCanManage || echoUnit.canCoordinate
    // Echo programme work (the ONE RULE, level 3): a member active on the
    // programme with a head-issued grant may work that programme's equipment
    // rows and AV briefings. The database decides (can_work_unit_programme).
    const echoWork = useEchoProgrammeWork({
        userId: echoUnit.currentUser?.id,
        isMember: echoUnit.isMember,
        canCoordinate: echoUnit.canCoordinate,
    })
    const canEditItem = (item: Pick<Equipment, 'program_id'>) => canManage || echoWork.canWork(item.program_id)
    // Programmes a programme worker may file equipment under (managers may use any, or none).
    const workablePrograms = programs.filter(program => echoWork.workable.has(program.id))
    const canAddEquipment = canManage || workablePrograms.length > 0
    // eo_logs_echo_insert: own row, Echo member or admin/Command (is_admin()).
    const canLogEoCheck = echoUnit.isMember || echoUnit.isCommand || echoUnit.isPlatformAdmin
    // Tasks and Programme team: Echo members and Command (the components decide
    // who adds, assigns or grants). The Echo head gives programme work here.
    const canSeeWork = canSeeUnitWork(echoUnit)
    const [pageTab, selectPageTab] = useAddressTab(canSeeWork ? ["equipment", "tasks", "team"] : ["equipment"])
    const [searchQuery, setSearchQuery] = useState('')
    const [filterType, setFilterType] = useState('all')
    const [filterStatus, setFilterStatus] = useState('all')
    const [activeTab, setActiveTab] = useState('all')

    const [formData, setFormData] = useState({
        name: '',
        type: 'sound',
        subtype: '',
        quantity: 1,
        status: 'available',
        program_id: '',
        serial_number: '',
        location: '',
        additional_info: ''
    })

    useEffect(() => {
        loadData()
        checkPermissions()

        // Subscribe to realtime updates
        const channel = supabase
            .channel('equipment-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, () => {
                loadData()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const checkPermissions = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data } = await supabase
                .from('users')
                .select('role, has_admin_access')
                .eq('id', user.id)
                .single()

            if (data && (isPlatformAdministrator(data.role, data.has_admin_access) || ALLOWED_ROLES.includes(data.role))) {
                setRoleCanManage(true)
            }
        } catch (error) {
            console.error('Error checking permissions:', error)
        }
    }

    const loadData = async () => {
        try {
            // Load equipment
            const { data: equipmentData, error: equipmentError } = await (supabase as any)
                .from('equipment')
                .select(`
          *,
          programs(name),
          assigned_user:users!equipment_assigned_to_fkey(full_name, oscar)
        `)
                .order('created_at', { ascending: false })

            if (equipmentError) throw equipmentError
            setEquipment(equipmentData || [])
            setLoadFailed(false)

            // Load programs
            const { data: programsData } = await supabase
                .from('programs')
                .select('id, name, status')
                .order('name')

            setPrograms(programsData || [])
        } catch (error) {
            console.error('Error loading data:', error)
            setLoadFailed(true)
            toast.error('Failed to load equipment data')
        } finally {
            setLoading(false)
        }
    }

    const retryLoad = async () => {
        setRetrying(true)
        try {
            await loadData()
        } finally {
            setRetrying(false)
        }
    }

    useReloadOnDeletion(['equipment', 'programs', 'users'], () => { void loadData() })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (saving) return
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            if (!canManage && !(formData.program_id && echoWork.canWork(formData.program_id))) {
                throw new UserFacingError('Choose a programme you work on for Echo.')
            }

            const payload = {
                name: formData.name,
                type: formData.type,
                subtype: formData.subtype || null,
                quantity: formData.quantity,
                status: formData.status,
                program_id: formData.program_id || null,
                serial_number: formData.serial_number || null,
                location: formData.location || null,
                additional_info: formData.additional_info || null,
                updated_at: new Date().toISOString()
            }

            if (editing) {
                const { data: updated, error } = await (supabase as any)
                    .from('equipment')
                    .update(payload)
                    .eq('id', editing.id)
                    .select('id')

                if (error) throw error
                // RLS hides rows the officer may not change, so an update can match nothing.
                if (!updated?.length) throw new UserFacingError(NOT_YOURS)
                toast.success('Equipment updated successfully')
            } else {
                const { error } = await (supabase as any)
                    .from('equipment')
                    .insert([{ ...payload, created_by: user?.id }])

                if (error) throw error
                toast.success('Equipment added successfully')
            }

            setDialogOpen(false)
            resetForm()
            loadData()
        } catch (error: any) {
            console.error('Error saving equipment:', error)
            notifyError(error, 'Failed to save equipment')
        } finally {
            setSaving(false)
        }
    }

    const handleEdit = (item: Equipment) => {
        setEditing(item)
        setFormData({
            name: item.name,
            type: item.type,
            subtype: item.subtype || '',
            quantity: item.quantity,
            status: item.status,
            program_id: item.program_id || '',
            serial_number: item.serial_number || '',
            location: item.location || '',
            additional_info: item.additional_info || ''
        })
        setDialogOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!await confirm({ message: 'Are you sure you want to delete this equipment?', variant: 'destructive' })) return

        try {
            const { data: deleted, error } = await (supabase as any)
                .from('equipment')
                .delete()
                .eq('id', id)
                .select('id')

            if (error) throw error
            if (!deleted?.length) throw new UserFacingError(NOT_YOURS)
            toast.success('Equipment deleted')
            loadData()
        } catch (error: any) {
            notifyError(error, 'Failed to delete')
        }
    }

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()

            const { data: updated, error } = await (supabase as any)
                .from('equipment')
                .update({
                    status: newStatus,
                    last_checked_at: new Date().toISOString(),
                    last_checked_by: user?.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select('id')

            if (error) throw error
            if (!updated?.length) throw new UserFacingError(NOT_YOURS)

            // Log the action
            await (supabase as any).from('equipment_logs').insert([{
                equipment_id: id,
                action: 'status_change',
                new_status: newStatus,
                performed_by: user?.id
            }])

            toast.success(`Status updated to ${STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label}`)
            loadData()
        } catch (error: any) {
            notifyError(error, 'Failed to update status')
        }
    }

    const resetForm = () => {
        setFormData({
            name: '',
            type: 'sound',
            subtype: '',
            quantity: 1,
            status: 'available',
            program_id: '',
            serial_number: '',
            location: '',
            additional_info: ''
        })
        setEditing(null)
    }

    const openCreateDialog = () => {
        resetForm()
        // A programme worker files equipment under a programme they work on.
        if (!canManage && workablePrograms.length > 0) {
            setFormData(prev => ({ ...prev, program_id: workablePrograms[0].id }))
        }
        setDialogOpen(true)
    }

    const getTypeIcon = (type: string) => {
        const found = EQUIPMENT_TYPES.find(t => t.value === type)
        return found ? found.icon : Package
    }

    // Filter equipment
    const filteredEquipment = equipment.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.serial_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.location?.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesType = filterType === 'all' || item.type === filterType
        const matchesStatus = filterStatus === 'all' || item.status === filterStatus
        const matchesTab = activeTab === 'all' || item.type === activeTab
        return matchesSearch && matchesType && matchesStatus && matchesTab
    })

    // Stats
    const stats = {
        total: equipment.length,
        available: equipment.filter(e => e.status === 'available').length,
        inUse: equipment.filter(e => e.status === 'in_use').length,
        maintenance: equipment.filter(e => e.status === 'maintenance').length,
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="h-8 w-48 rounded-md skeleton" />
                        <div className="mt-2 h-4 w-72 rounded-md skeleton" />
                    </div>
                    <div className="h-10 w-32 rounded-md skeleton" />
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-24 rounded-lg skeleton" />
                    ))}
                </div>
                <div className="h-96 rounded-lg skeleton" />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <PageHeader
                icon={Volume2}
                title="Echo"
                badge="Equipment Management"
                description="Manage multimedia and sound equipment for programs."
                actions={canAddEquipment && (
                    <Button onClick={openCreateDialog}>
                        <Plus aria-hidden="true" />
                        Add Equipment
                    </Button>
                )}
            />

            {echoUnit.loadFailed && (
                <Card>
                    <ErrorState
                        title="Could not check your Echo access"
                        description="Echo controls stay hidden until your unit access loads."
                        onRetry={() => { void queryClient.invalidateQueries({ queryKey: ['unit-access'] }) }}
                    />
                </Card>
            )}

            <Tabs value={pageTab} onValueChange={selectPageTab} className="space-y-6">
            {canSeeWork && (
                <TabsList className="grid h-auto w-full max-w-xl grid-cols-3 gap-1 p-1" aria-label="Echo sections">
                    <TabsTrigger value="equipment" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Equipment</TabsTrigger>
                    <TabsTrigger value="tasks" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Tasks</TabsTrigger>
                    <TabsTrigger value="team" className="min-h-11 min-w-0 gap-1.5 whitespace-normal text-xs sm:text-sm"><UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Programme team</TabsTrigger>
                </TabsList>
            )}

            <TabsContent value="equipment" className="space-y-6">
            {/* ── Papa AV Briefings (Echo members) + EO Pre-Op Checklist (Echo members, Command, admins) ── */}
            {canLogEoCheck && (
                <div className={echoUnit.isMember ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
                    {echoUnit.isMember && (
                        <div className="min-w-0">
                            <EchoBriefings
                                userId={echoUnit.currentUser?.id}
                                canCoordinate={echoUnit.canCoordinate}
                                work={echoWork}
                            />
                        </div>
                    )}
                    <EOChecklist programs={programs} />
                </div>
            )}

            {echoUnit.isMember && !canManage && !echoWork.isLoading && workablePrograms.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    Equipment is read only for you. To update it, you need to be active on a programme and added to its Echo team by your Echo head.
                </p>
            )}

            {loadFailed && equipment.length === 0 ? (
                <Card>
                    <ErrorState
                        title="Could not load equipment"
                        onRetry={retryLoad}
                        retrying={retrying}
                    />
                </Card>
            ) : (
            <>
            {/* Stats Cards */}
            <StatGrid>
                <StatCard label="Total Equipment" value={stats.total} />
                <StatCard label="Available" value={stats.available} tone="success" />
                <StatCard label="In Use" value={stats.inUse} tone="info" />
                <StatCard label="Maintenance" value={stats.maintenance} tone="warning" />
            </StatGrid>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search equipment..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Equipment Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex flex-wrap h-auto gap-1">
                    <TabsTrigger value="all">All</TabsTrigger>
                    {EQUIPMENT_TYPES.map((type) => (
                        <TabsTrigger key={type.value} value={type.value} className="gap-1" aria-label={type.label}>
                            <type.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="sm:hidden">{type.short}</span>
                            <span className="hidden sm:inline">{type.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value={activeTab} className="mt-4">
                    {filteredEquipment.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Package className="h-12 w-12 text-muted-foreground/50" />
                                <p className="mt-4 text-lg font-medium">No equipment found</p>
                                <p className="text-sm text-muted-foreground">
                                    {searchQuery || filterStatus !== 'all'
                                        ? 'Try adjusting your filters'
                                        : 'Add your first piece of equipment'}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {filteredEquipment.map((item) => {
                                const TypeIcon = getTypeIcon(item.type)
                                const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.available
                                const StatusIcon = statusConfig.icon

                                return (
                                    <Card key={item.id} className="hover:shadow-lg transition-all hover:-translate-y-0.5">
                                        <CardHeader className="pb-2">
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    <div className="shrink-0 p-2 rounded-md bg-primary/10">
                                                        <TypeIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <CardTitle className="text-base break-words">{item.name}</CardTitle>
                                                        {item.subtype && (
                                                            <CardDescription className="text-xs break-words">{item.subtype}</CardDescription>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge className={`${statusConfig.color} text-white shrink-0 whitespace-nowrap`}>
                                                    <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
                                                    {statusConfig.label}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                    <span className="text-muted-foreground">Quantity:</span>
                                                    <span className="ml-1 font-medium">{item.quantity}</span>
                                                </div>
                                                {item.location && (
                                                    <div>
                                                        <span className="text-muted-foreground">Location:</span>
                                                        <span className="ml-1 font-medium">{item.location}</span>
                                                    </div>
                                                )}
                                                {item.serial_number && (
                                                    <div className="col-span-2">
                                                        <span className="text-muted-foreground">S/N:</span>
                                                        <span className="ml-1 font-mono text-xs">{item.serial_number}</span>
                                                    </div>
                                                )}
                                                {item.programs && (
                                                    <div className="col-span-2">
                                                        <Badge variant="outline" className="text-xs">
                                                            {item.programs.name}
                                                        </Badge>
                                                    </div>
                                                )}
                                            </div>

                                            {canEditItem(item) && (
                                                <div className="flex gap-2 pt-2 border-t">
                                                    <Select
                                                        value={item.status}
                                                        onValueChange={(value) => handleStatusChange(item.id, value)}
                                                    >
                                                        <SelectTrigger className="flex-1 h-11 sm:h-8 text-xs" aria-label={`Status of ${item.name}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                                                <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button aria-label={`Edit ${item.name}`}
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-11 w-11 sm:h-8 sm:w-8"
                                                        onClick={() => handleEdit(item)}
                                                    >
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                    <Button aria-label={`Delete ${item.name}`}
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-11 w-11 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                                                        onClick={() => handleDelete(item.id)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
            </>
            )}
            </TabsContent>

            {canSeeWork && (
                <>
                    <TabsContent value="tasks" className="space-y-6">
                        <UnitTasks unitSlug="echo" />
                    </TabsContent>
                    <TabsContent value="team" className="space-y-6">
                        <UnitProgrammeTeam unitSlug="echo" />
                    </TabsContent>
                </>
            )}
            </Tabs>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Equipment' : 'Add Equipment'}</DialogTitle>
                        <DialogDescription>
                            {editing ? 'Update equipment details' : 'Add new equipment to the inventory'}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="name">Name *</Label>
                                <Input
                                    id="name"
                                    required
                                    placeholder="e.g., Shure SM58 Microphone"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="type">Type *</Label>
                                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EQUIPMENT_TYPES.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                <div className="flex items-center gap-2">
                                                    <type.icon className="h-4 w-4" />
                                                    {type.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="subtype">Subtype</Label>
                                <Input
                                    id="subtype"
                                    placeholder="e.g., Wireless, Handheld"
                                    value={formData.subtype}
                                    onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="quantity">Quantity</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min="1"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="program_id">Assigned Program</Label>
                                <Select
                                    value={formData.program_id || (canManage ? 'unassigned' : '')}
                                    onValueChange={(value) => setFormData({ ...formData, program_id: value === 'unassigned' ? '' : value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a program" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {canManage && <SelectItem value="unassigned">No Program</SelectItem>}
                                        {(canManage ? programs : workablePrograms).map((program) => (
                                            <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="serial_number">Serial Number</Label>
                                <Input
                                    id="serial_number"
                                    placeholder="e.g., SN-12345"
                                    value={formData.serial_number}
                                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="location">Storage Location</Label>
                                <Input
                                    id="location"
                                    placeholder="e.g., Sound Room, Cabinet A"
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="additional_info">Additional Information</Label>
                                <Textarea
                                    id="additional_info"
                                    placeholder="Any additional details, notes, or specifications..."
                                    value={formData.additional_info}
                                    onChange={(e) => setFormData({ ...formData, additional_info: e.target.value })}
                                    rows={3}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" pending={saving}>
                                {editing ? 'Update' : 'Add'} Equipment
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
