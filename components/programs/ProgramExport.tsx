'use client'

import { saveFile } from '@/lib/save-file'
import { isNativeShell } from '@/lib/native-shell'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { notifyError, UserFacingError } from '@/lib/notify'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { isCommandAuthority } from '@/lib/unit-access'

type ProgramExportProps = {
  programId: string
  programName: string
  status: string
}

/**
 * A programme export bypasses RLS (it holds every journey, incident and chat
 * message), so export_program_data only runs for is_admin(): platform admins
 * and Command. Everyone else never sees the button. Papa rows in the export
 * carry no phone, email or passport.
 */
export function canExportProgram(user: { role?: string | null; has_admin_access?: boolean | null } | null | undefined): boolean {
  return Boolean(user) && isCommandAuthority(user?.role, user?.has_admin_access)
}

/** A plain negative or positive decimal, e.g. a longitude like -73.77. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/

/**
 * Quotes a CSV cell and defuses spreadsheet formulas: a text value that
 * starts (after any spaces) with =, +, -, @, or that starts with a tab or
 * carriage return, gets a leading apostrophe. Numbers, and text that is a
 * plain number such as a negative coordinate, stay numbers.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'bigint') return `"${String(value)}"`
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const risky = /^[\t\r]/.test(text) || /^\s*[=+\-@]/.test(text)
  if (risky && !PLAIN_NUMBER.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export default function ProgramExport({ programId, programName }: ProgramExportProps) {
  const supabase = createClient()
  const { data: currentUser } = useCurrentUser()
  const [exporting, setExporting] = useState(false)

  const canExport = canExportProgram(currentUser)
  if (!canExport) return null

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new UserFacingError('Not authenticated')

      // Call the export function
      const { data: exportData, error: exportError } = await supabase
        .rpc('export_program_data', { program_uuid: programId })

      if (exportError) throw exportError

      // Save export record
      const { error: saveError } = await supabase
        .from('program_exports')
        .insert([{
          program_id: programId,
          exported_by: user.id,
          export_data: exportData,
          status: 'completed'
        }])

      if (saveError) throw saveError

      // Create downloadable file
      await saveFile(
        new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }),
        `${programName.replace(/\s+/g, '_')}_export_${new Date().toISOString().split('T')[0]}.json`,
      )

      // Also one CSV per table for easier viewing. In the phone app each file
      // would raise its own share sheet, a dozen in a row, so the app shares
      // the complete JSON only.
      if (!isNativeShell()) await exportToCSV(exportData, programName)

      toast.success('Program exported successfully!')
    } catch (error: any) {
      console.error('Error exporting program:', error)
      notifyError(error, 'Failed to export program')
    } finally {
      setExporting(false)
    }
  }

  const exportToCSV = async (data: any, programName: string) => {
    try {
      const exportList = [
        { key: 'papas', suffix: '_Papas.csv' },
        { key: 'journeys', suffix: '_Journeys.csv' },
        { key: 'incidents', suffix: '_Incidents.csv' },
        { key: 'chat_messages', suffix: '_Chat.csv' },
        { key: 'cheetahs', suffix: '_Cheetahs.csv' },
        { key: 'theatres', suffix: '_Theatres.csv' },
        { key: 'nests', suffix: '_Nests.csv' },
        { key: 'eagle_squares', suffix: '_Eagle_Squares.csv' },
        { key: 'flight_tracking', suffix: '_Flight_Tracking.csv' },
        { key: 'equipment', suffix: '_Equipment.csv' },
        { key: 'equipment_logs', suffix: '_Equipment_Logs.csv' },
        { key: 'staff_assignments', suffix: '_Staff_Assignments.csv' }
      ]

      for (const item of exportList) {
        if (data[item.key] && data[item.key].length > 0) {
          const csv = convertToCSV(data[item.key])
          downloadCSV(csv, `${programName}${item.suffix}`)
          // Optional delay to prevent browser from blocking multiple downloads
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    } catch (error) {
      console.error('Error creating CSV:', error)
    }
  }

  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return ''

    const headers = Object.keys(data[0])
    const csvRows = []

    // Add headers
    csvRows.push(headers.join(','))

    // Add data rows
    for (const row of data) {
      csvRows.push(headers.map(header => csvCell(row[header])).join(','))
    }

    return csvRows.join('\n')
  }

  const downloadCSV = (csv: string, filename: string) => {
    void saveFile(new Blob([csv], { type: 'text/csv' }), filename).catch(() => undefined)
  }

  return (
    <Button
      onClick={handleExport}
      disabled={exporting}
      variant="default"
      size="sm"
      className="min-h-11 shrink-0 sm:min-h-9"
      aria-label={`Export ${programName}`}
    >
      {exporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="hidden sm:inline">Exporting...</span>
          <span className="sm:hidden">...</span>
        </>
      ) : (
        <>
          <Download className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Export Program</span>
          <span className="sm:hidden">Export</span>
        </>
      )}
    </Button>
  )
}
