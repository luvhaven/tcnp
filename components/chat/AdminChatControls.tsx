'use client'

import { useState } from 'react'
import { Archive, Download, Loader2, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface AdminChatControlsProps {
  programId?: string | null
  papaId?: string | null
  programName?: string | null
  team?: string | null
  teamName?: string | null
  canManageAll?: boolean
  onChanged?: () => void
}

export function AdminChatControls({ programId, papaId, programName, team, teamName, canManageAll = false, onChanged }: AdminChatControlsProps) {
  const [loading, setLoading] = useState(false)
  const confirm = useConfirm()
  const contextName = programName || teamName || 'this room'
  const fetchChats = async () => {
    if ((!programId && !team) || (programId && team) || (papaId && !programId)) throw new Error('Choose a valid room first.')
    const client = createClient()
    const rows: { id: string; created_at: string | null; content: string; sender: { full_name: string | null } | null }[] = []
    for (let offset = 0; ; offset += 500) {
      let query = client.from('chat_messages').select('id, created_at, content, sender:sender_id(full_name)').is('deleted_at', null).or('is_archived.is.null,is_archived.eq.false').order('created_at').order('id').range(offset, offset + 499)
      if (team) query = query.eq('team', team).is('program_id', null).is('papa_id', null)
      else { query = query.eq('program_id', programId!).is('team', null); query = papaId ? query.eq('papa_id', papaId) : query.is('papa_id', null) }
      const { data, error } = await query
      if (error) throw error
      rows.push(...data as unknown as typeof rows)
      if (data.length < 500) break
    }
    return rows
  }
  const exportChat = async (pdf: boolean) => {
    if (loading) return
    setLoading(true)
    try {
      const rows = await fetchChats()
      if (!rows.length) { toast.info('No messages to export.'); return }
      if (pdf) {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
        const doc = new jsPDF()
        doc.setFontSize(14); doc.text(doc.splitTextToSize(`Chat log: ${contextName}`, 180), 14, 16)
        autoTable(doc, { head: [['Date / time', 'Sender', 'Message']], body: rows.map(row => [row.created_at ? new Date(row.created_at).toLocaleString() : '', row.sender?.full_name || 'Officer', row.content]), startY: 35, styles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 35 } } })
        doc.save(`chat-${papaId || programId || team}-${Date.now()}.pdf`)
      } else {
        const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"` }
        const csv = [['id', 'created_at', 'sender', 'content'], ...rows.map(row => [row.id, row.created_at, row.sender?.full_name || 'Officer', row.content])].map(row => row.map(cell).join(',')).join('\r\n')
        const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
        const link = document.createElement('a'); link.href = url; link.download = `chat-${papaId || programId || team}-${Date.now()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      toast.success('Chat exported')
    } catch { toast.error('The export could not finish. Please retry.') }
    finally { setLoading(false) }
  }
  const archive = async () => {
    if (loading || (!programId && !team)) return
    if (!await confirm({ title: 'Archive room messages?', message: `Messages in ${contextName} will be hidden from the conversation. Other rooms are unaffected.`, variant: 'destructive' })) return
    setLoading(true)
    try {
      const response = await fetch('/api/admin/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive', programId, papaId, team }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Messages could not be archived.')
      toast.success('Room messages archived'); onChanged?.()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Messages could not be archived.') }
    finally { setLoading(false) }
  }
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={loading} aria-label="Room actions" className="h-10 w-10 rounded-xl">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-5 w-5" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel>Room actions</DropdownMenuLabel><DropdownMenuItem onClick={() => void exportChat(false)}><Download className="mr-2 h-4 w-4" />Export CSV</DropdownMenuItem><DropdownMenuItem onClick={() => void exportChat(true)}><Download className="mr-2 h-4 w-4" />Export PDF</DropdownMenuItem>{canManageAll && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void archive()}><Archive className="mr-2 h-4 w-4" />Archive messages</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
}
