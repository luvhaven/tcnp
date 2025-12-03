"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ShieldCheck, Loader2, Search, Plus, Edit, Trash2, User, Upload, Eye, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import Image from "next/image"

export default function VIPManagementPanel() {
    const supabase = createClient()
    const [selectedProgramId, setSelectedProgramId] = useState<string>("")
    const [programs, setPrograms] = useState<any[]>([])
    const [vips, setVips] = useState<any[]>([])
    const [filteredVips, setFilteredVips] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [detailDialogOpen, setDetailDialogOpen] = useState(false)
    const [selectedVIP, setSelectedVIP] = useState<any>(null)
    const [editingVIP, setEditingVIP] = useState<any>(null)
    const [uploading, setUploading] = useState(false)
    const [formData, setFormData] = useState({
        full_name: '',
        title: '',
        access_level: 'standard',
        notes: '',
        organization: '',
        contact_info: '',
        photo_url: ''
    })

    useEffect(() => {
        loadPrograms()
    }, [])

    useEffect(() => {
        if (selectedProgramId) {
            loadVIPs()
        }
    }, [selectedProgramId])

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredVips(vips)
        } else {
            const query = searchQuery.toLowerCase()
            const filtered = vips.filter(vip =>
                vip.full_name?.toLowerCase().includes(query) ||
                vip.title?.toLowerCase().includes(query) ||
                vip.organization?.toLowerCase().includes(query)
            )
            setFilteredVips(filtered)
        }
    }, [searchQuery, vips])

    const loadPrograms = async () => {
        const { data, error } = await supabase
            .from('programs')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error("Error loading programs:", error)
            toast.error("Failed to load programs")
        } else {
            setPrograms(data || [])
        }
    }

    const loadVIPs = async () => {
        if (!selectedProgramId) return

        setLoading(true)
        const { data, error } = await supabase
            .from('theatre_vips')
            .select('*')
            .eq('program_id', selectedProgramId)
            .order('full_name')

        if (error) {
            console.error("Error loading VIPs:", error)
            toast.error("Failed to load VIPs")
        } else {
            setVips(data || [])
            setFilteredVips(data || [])
        }
        setLoading(false)
    }

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error("Please upload an image file")
            return
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image must be less than 5MB")
            return
        }

        setUploading(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
            const filePath = `vip-photos/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('vip-photos')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('vip-photos')
                .getPublicUrl(filePath)

            setFormData({ ...formData, photo_url: publicUrl })
            toast.success("Photo uploaded successfully")
        } catch (error: any) {
            console.error("Error uploading photo:", error)
            toast.error(error.message || "Failed to upload photo")
        } finally {
            setUploading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!selectedProgramId) {
            toast.error("Please select a program")
            return
        }

        setLoading(true)
        try {
            if (editingVIP) {
                const { error } = await supabase
                    .from('theatre_vips')
                    .update(formData)
                    .eq('id', editingVIP.id)

                if (error) throw error
                toast.success("VIP updated successfully")
            } else {
                const { error } = await supabase
                    .from('theatre_vips')
                    .insert([{ ...formData, program_id: selectedProgramId }])

                if (error) throw error
                toast.success("VIP added successfully")
            }

            setAddDialogOpen(false)
            setEditingVIP(null)
            resetForm()
            loadVIPs()
        } catch (error: any) {
            console.error("Error saving VIP:", error)
            toast.error(error.message || "Failed to save VIP")
        } finally {
            setLoading(false)
        }
    }

    const handleEdit = (vip: any) => {
        setEditingVIP(vip)
        setFormData({
            full_name: vip.full_name || '',
            title: vip.title || '',
            access_level: vip.access_level || 'standard',
            notes: vip.notes || '',
            organization: vip.organization || '',
            contact_info: vip.contact_info || '',
            photo_url: vip.photo_url || ''
        })
        setAddDialogOpen(true)
    }

    const handleViewDetails = (vip: any) => {
        setSelectedVIP(vip)
        setDetailDialogOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this VIP?')) return

        try {
            const { error } = await supabase
                .from('theatre_vips')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success("VIP removed successfully")
            loadVIPs()
        } catch (error: any) {
            console.error("Error deleting VIP:", error)
            toast.error(error.message || "Failed to remove VIP")
        }
    }

    const resetForm = () => {
        setFormData({
            full_name: '',
            title: '',
            access_level: 'standard',
            notes: '',
            organization: '',
            contact_info: '',
            photo_url: ''
        })
    }

    const openAddDialog = () => {
        setEditingVIP(null)
        resetForm()
        setAddDialogOpen(true)
    }

    const getAccessLevelColor = (level: string) => {
        switch (level) {
            case 'vvip': return 'destructive'
            case 'vip': return 'default'
            default: return 'secondary'
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Select Program</CardTitle>
                    <CardDescription>Choose the program to manage VIP access</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a program..." />
                        </SelectTrigger>
                        <SelectContent>
                            {programs.map((program) => (
                                <SelectItem key={program.id} value={program.id}>
                                    {program.name} ({program.status})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {selectedProgramId && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5" />
                                    VIP Directory
                                </CardTitle>
                                <CardDescription>
                                    Manage authorized personnel for this program
                                </CardDescription>
                            </div>
                            <Button onClick={openAddDialog}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add VIP
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Search Bar */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, title, or organization..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        {/* VIP List */}
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : filteredVips.length === 0 ? (
                            <div className="text-center py-12">
                                <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                                <p className="text-muted-foreground mb-4">
                                    {searchQuery ? 'No VIPs found matching your search' : 'No VIPs registered for this program'}
                                </p>
                                {!searchQuery && (
                                    <Button variant="outline" onClick={openAddDialog}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add First VIP
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                {filteredVips.map((vip) => (
                                    <div
                                        key={vip.id}
                                        className="group relative rounded-lg border bg-card p-4 hover:bg-accent/50 transition-all cursor-pointer hover:shadow-md"
                                        onClick={() => handleViewDetails(vip)}
                                    >
                                        <div className="flex gap-3">
                                            {/* Photo */}
                                            <div className="flex-shrink-0">
                                                {vip.photo_url ? (
                                                    <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20">
                                                        <Image
                                                            src={vip.photo_url}
                                                            alt={vip.full_name}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border-2 border-muted">
                                                        <User className="h-8 w-8 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <h4 className="font-semibold truncate">{vip.full_name}</h4>
                                                    <Badge variant={getAccessLevelColor(vip.access_level)} className="text-xs">
                                                        {vip.access_level?.toUpperCase()}
                                                    </Badge>
                                                </div>
                                                {vip.title && (
                                                    <p className="text-sm text-muted-foreground truncate">{vip.title}</p>
                                                )}
                                                {vip.organization && (
                                                    <p className="text-xs text-muted-foreground truncate mt-1">
                                                        {vip.organization}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleEdit(vip)
                                                }}
                                            >
                                                <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDelete(vip.id)
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Stats */}
                        {!loading && vips.length > 0 && (
                            <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
                                <span>
                                    Showing {filteredVips.length} of {vips.length} VIP{vips.length !== 1 ? 's' : ''}
                                </span>
                                <div className="flex gap-4">
                                    <span>VVIP: {vips.filter(v => v.access_level === 'vvip').length}</span>
                                    <span>VIP: {vips.filter(v => v.access_level === 'vip').length}</span>
                                    <span>Standard: {vips.filter(v => v.access_level === 'standard').length}</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Detail View Dialog */}
            <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>VIP Details</DialogTitle>
                    </DialogHeader>
                    {selectedVIP && (
                        <div className="space-y-6">
                            {/* Photo */}
                            <div className="flex justify-center">
                                {selectedVIP.photo_url ? (
                                    <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-primary/20">
                                        <Image
                                            src={selectedVIP.photo_url}
                                            alt={selectedVIP.full_name}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center border-4 border-muted">
                                        <User className="h-16 w-16 text-muted-foreground" />
                                    </div>
                                )}
                            </div>

                            {/* Details */}
                            <div className="space-y-4">
                                <div className="text-center">
                                    <h3 className="text-2xl font-bold">{selectedVIP.full_name}</h3>
                                    <div className="flex items-center justify-center gap-2 mt-2">
                                        <Badge variant={getAccessLevelColor(selectedVIP.access_level)}>
                                            {selectedVIP.access_level?.toUpperCase()}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="grid gap-3">
                                    {selectedVIP.title && (
                                        <div>
                                            <Label className="text-muted-foreground">Title/Position</Label>
                                            <p className="font-medium">{selectedVIP.title}</p>
                                        </div>
                                    )}
                                    {selectedVIP.organization && (
                                        <div>
                                            <Label className="text-muted-foreground">Organization</Label>
                                            <p className="font-medium">{selectedVIP.organization}</p>
                                        </div>
                                    )}
                                    {selectedVIP.contact_info && (
                                        <div>
                                            <Label className="text-muted-foreground">Contact Information</Label>
                                            <p className="font-medium">{selectedVIP.contact_info}</p>
                                        </div>
                                    )}
                                    {selectedVIP.notes && (
                                        <div>
                                            <Label className="text-muted-foreground">Notes</Label>
                                            <p className="font-medium">{selectedVIP.notes}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                                    Close
                                </Button>
                                <Button onClick={() => {
                                    setDetailDialogOpen(false)
                                    handleEdit(selectedVIP)
                                }}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Add/Edit Dialog */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingVIP ? 'Edit VIP' : 'Add VIP'}</DialogTitle>
                        <DialogDescription>
                            {editingVIP ? 'Update VIP information' : 'Add a new VIP to this program'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Photo Upload */}
                        <div className="space-y-2">
                            <Label>Photo</Label>
                            <div className="flex items-center gap-4">
                                {formData.photo_url ? (
                                    <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20">
                                        <Image
                                            src={formData.photo_url}
                                            alt="VIP Photo"
                                            fill
                                            className="object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, photo_url: '' })}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                                        >
                                            <X className="h-6 w-6 text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-muted">
                                        <User className="h-10 w-10 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handlePhotoUpload}
                                        disabled={uploading}
                                        className="cursor-pointer"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Upload a photo (max 5MB)
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="full_name">Full Name *</Label>
                                <Input
                                    id="full_name"
                                    required
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    placeholder="e.g., John Doe"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="title">Title/Position</Label>
                                <Input
                                    id="title"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g., Minister, CEO"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="organization">Organization</Label>
                                <Input
                                    id="organization"
                                    value={formData.organization}
                                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                                    placeholder="e.g., Ministry of..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="access_level">Access Level *</Label>
                                <Select
                                    value={formData.access_level}
                                    onValueChange={(value) => setFormData({ ...formData, access_level: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="standard">Standard</SelectItem>
                                        <SelectItem value="vip">VIP</SelectItem>
                                        <SelectItem value="vvip">VVIP</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contact_info">Contact Information</Label>
                            <Input
                                id="contact_info"
                                value={formData.contact_info}
                                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                                placeholder="Phone, email, etc."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Additional information..."
                                rows={3}
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setAddDialogOpen(false)
                                    setEditingVIP(null)
                                    resetForm()
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading || uploading}>
                                {loading || uploading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {uploading ? 'Uploading...' : 'Saving...'}
                                    </>
                                ) : (
                                    <>{editingVIP ? 'Update' : 'Add'} VIP</>
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
