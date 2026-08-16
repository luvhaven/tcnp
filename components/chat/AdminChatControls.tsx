'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MoreVertical, Download, Archive, Trash2, FileText, Loader2 } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'

interface AdminChatControlsProps {
    programId?: string | null
    programName?: string | null
    team?: string | null
    teamName?: string | null
}

export function AdminChatControls({ programId, programName, team, teamName }: AdminChatControlsProps) {
    const [loading, setLoading] = useState(false)
    const confirm = useConfirm()
    const supabase = createClient()

    // Helper to fetch chats
    const fetchChats = async () => {
        let query = supabase
            .from('chat_messages')
            .select('*, users:sender_id(full_name, role)')
            .order('created_at', { ascending: true })

        if (programId) {
            query = query.eq('program_id', programId)
        } else if (team) {
            query = query.eq('team', team)
        }

        const { data, error } = await query
        if (error) throw error
        return data
    }

    const contextName = programName || teamName || (team ? `Team ${team}` : null)

    const handleDownloadPDF = async () => {
        try {
            setLoading(true)
            const chats = await fetchChats()
            if (!chats || chats.length === 0) {
                toast.info('No messages to export.')
                return
            }

            const doc = new jsPDF()
            const title = contextName ? `Chat Log - ${contextName}` : 'All Chats Log'
            doc.text(title, 14, 15)

            const tableData = chats.map(chat => [
                format(new Date((chat as any).created_at || new Date().toISOString()), 'yyyy-MM-dd HH:mm:ss'),
                (chat as any).users?.full_name || 'System / Unknown',
                chat.content
            ])

            autoTable(doc, {
                head: [['Date/Time', 'Sender', 'Message']],
                body: tableData,
                startY: 20,
                styles: { fontSize: 9 },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 40 },
                    2: { cellWidth: 'auto' }
                }
            })

            doc.save(`chat-export-${programId || team || 'all'}-${Date.now()}.pdf`)
            toast.success('Successfully downloaded PDF.')
        } catch (err) {
            console.error(err)
            toast.error('Failed to export PDF.')
        } finally {
            setLoading(false)
        }
    }

    const handleDownloadCSV = async () => {
        try {
            setLoading(true)
            const chats = await fetchChats()
            if (!chats || chats.length === 0) {
                toast.info('No messages to export.')
                return
            }

            const headers = ['id', 'created_at', 'sender', 'content']
            const rows = chats.map(chat => {
                const sender = (chat as any).users?.full_name || 'Unknown'
                // Escape quotes
                const content = `"${(chat.content || '').replace(/"/g, '""')}"`
                return [chat.id, chat.created_at, `"${sender}"`, content].join(',')
            })

            const csvContent = [headers.join(','), ...rows].join('\n')
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `chat-export-${programId || team || 'all'}-${Date.now()}.csv`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            toast.success('Successfully downloaded CSV.')
        } catch (err) {
            console.error(err)
            toast.error('Failed to export CSV.')
        } finally {
            setLoading(false)
        }
    }

    const handleArchive = async () => {
        if (
            !(await confirm({
                title: 'Confirm Archive',
                message: `Are you sure you want to archive ${contextName ? `chats in ${contextName}` : 'all chats'}? They will no longer appear in the main chat view.`,
                variant: 'destructive',
            }))
        ) {
            return
        }

        try {
            setLoading(true)
            const response = await fetch('/api/admin/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'archive',
                    programId: programId || undefined,
                    team: team || undefined
                })
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.error || 'Failed to archive chats')
            }

            toast.success('Chats successfully archived.')
            window.location.reload()
        } catch (err: any) {
            console.error(err)
            toast.error(err.message || 'Failed to archive chats.')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        const scope = contextName ? contextName : 'ALL programs and teams'
        if (
            !(await confirm({
                title: 'Absolute Danger Zone',
                message: `You are about to PERMANENTLY DELETE all chat messages in ${scope}. This action is irreversible and no recovery is possible. Are you absolutely certain you want to proceed?`,
                variant: 'destructive',
            }))
        ) {
            return
        }

        // Double confirmation for deletion
        if (
            !(await confirm({
                title: 'Final Confirmation',
                message: 'There is no coming back from this. Last chance to cancel.',
                variant: 'destructive',
            }))
        ) {
            return
        }

        try {
            setLoading(true)
            let url = '/api/admin/chat?all=true'
            if (programId) {
                url = `/api/admin/chat?programId=${encodeURIComponent(programId)}`
            } else if (team) {
                url = `/api/admin/chat?team=${encodeURIComponent(team)}`
            }

            const response = await fetch(url, {
                method: 'DELETE'
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete chats')
            }

            toast.success(`Chats successfully and permanently deleted (${result.count || 0} messages removed).`)
            window.location.reload()
        } catch (err: any) {
            console.error(err)
            toast.error(err.message || 'Failed to delete chats.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 group relative">
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                    ) : (
                        <MoreVertical className="h-4 w-4 text-amber-600 dark:text-amber-400 group-hover:text-amber-700" />
                    )}
                    <span>Admin Actions</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>
                    {contextName ? `Manage "${contextName}"` : 'Manage All Chats'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Download className="mr-2 h-4 w-4" />
                        <span>Download / Export</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={handleDownloadPDF} disabled={loading}>
                            <FileText className="mr-2 h-4 w-4 text-blue-600" />
                            <span>Export as PDF</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadCSV} disabled={loading}>
                            <FileText className="mr-2 h-4 w-4 text-green-600" />
                            <span>Export as CSV</span>
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleArchive} disabled={loading}>
                    <Archive className="mr-2 h-4 w-4 text-amber-600" />
                    <span className="text-amber-600 font-medium">Archive Chats</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleDelete} disabled={loading}>
                    <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                    <span className="text-destructive font-bold">Destroy Chats</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
