"use client"

import { useEffect, useState, useCallback } from "react"
import PapaBriefingsSection from "@/components/papas/PapaBriefingsSection"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
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
    Filter
} from "lucide-react"

// Equipment types with icons
const EQUIPMENT_TYPES = [
    { value: 'sound', label: 'Sound Equipment', icon: Volume2 },
    { value: 'microphone', label: 'Microphones', icon: Mic },
    { value: 'presentation', label: 'Presentation', icon: Monitor },
    { value: 'camera', label: 'Cameras', icon: Camera },
    { value: 'lighting', label: 'Lighting', icon: Lightbulb },
    { value: 'cables', label: 'Cables & Accessories', icon: Cable },
    { value: 'other', label: 'Other', icon: Package },
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

const ALLOWED_ROLES = [
    'super_admin', 'dev_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command',
    'echo_oscar', 'head_echo_oscar'
]

export default function EchoPage() {
    const supabase = createClient()
    const confirm = useConfirm()
    const [equipment, setEquipment] = useState<Equipment[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Equipment | null>(null)
const [canManage, setCanManage] = useState(false)
    const [userRole, setUserRole] = useState('')
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
                .select('role')
                .eq('id', user.id)
                .single()

            if (data && ALLOWED_ROLES.includes(data.role)) {
                setCanManage(true)
            }
            if (data) setUserRole(data.role)
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

            // Load programs
            const { data: programsData } = await supabase
                .from('programs')
                .select('id, name, status')
                .order('name')

            setPrograms(programsData || [])
        } catch (error) {
            console.error('Error loading data:', error)
            toast.error('Failed to load equipment data')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        try {
            const { data: { user } } = await supabase.auth.getUser()

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
                const { error } = await (supabase as any)
                    .from('equipment')
                    .update(payload)
                    .eq('id', editing.id)

                if (error) throw error
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
            toast.error(error.message || 'Failed to save equipment')
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
            const { error } = await (supabase as any)
                .from('equipment')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success('Equipment deleted')
            loadData()
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete')
        }
    }

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()

            const { error } = await (supabase as any)
                .from('equipment')
                .update({
                    status: newStatus,
                    last_checked_at: new Date().toISOString(),
                    last_checked_by: user?.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)

            if (error) throw error

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
            toast.error(error.message || 'Failed to update status')
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
            {/* ── Papa AV Briefings ── shown for Echo Oscar roles */}
            {userRole && ['echo_oscar', 'head_echo_oscar'].includes(userRole) && (
                <PapaBriefingsSection role={userRole} />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Volume2 className="h-8 w-8 text-primary" />
                        Echo - Equipment Management
                    </h1>
                    <p className="text-muted-foreground">
                        Manage multimedia and sound equipment for programs
                    </p>
                </div>
                {canManage && (
                    <Button onClick={openCreateDialog} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Equipment
                    </Button>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Equipment</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow border-green-200 dark:border-green-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600">Available</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.available}</div>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600">In Use</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{stats.inUse}</div>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow border-orange-200 dark:border-orange-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-orange-600">Maintenance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{stats.maintenance}</div>
                    </CardContent>
                </Card>
            </div>

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
                        <TabsTrigger key={type.value} value={type.value} className="gap-1">
                            <type.icon className="h-4 w-4" />
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
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-2 rounded-md bg-primary/10">
                                                        <TypeIcon className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <CardTitle className="text-base">{item.name}</CardTitle>
                                                        {item.subtype && (
                                                            <CardDescription className="text-xs">{item.subtype}</CardDescription>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge className={`${statusConfig.color} text-white`}>
                                                    <StatusIcon className="h-3 w-3 mr-1" />
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

                                            {canManage && (
                                                <div className="flex gap-2 pt-2 border-t">
                                                    <Select
                                                        value={item.status}
                                                        onValueChange={(value) => handleStatusChange(item.id, value)}
                                                    >
                                                        <SelectTrigger className="flex-1 h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                                                <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => handleEdit(item)}
                                                    >
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
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
                                    value={formData.program_id || 'unassigned'}
                                    onValueChange={(value) => setFormData({ ...formData, program_id: value === 'unassigned' ? '' : value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a program" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">No Program</SelectItem>
                                        {programs.map((program) => (
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
                            <Button type="submit">
                                {editing ? 'Update' : 'Add'} Equipment
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
