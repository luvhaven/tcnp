'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type ProgramExportProps = {
  programId: string
  programName: string
  status: string
}

export default function ProgramExport({ programId, programName, status }: ProgramExportProps) {
  const supabase = createClient()
  const [exporting, setExporting] = useState(false)

  const canExport = ['completed', 'archived'].includes(status.toLowerCase())

  const handleExport = async () => {
    if (!canExport) {
      toast.error('Only completed or archived programs can be exported')
      return
    }

    setExporting(true)
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

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
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${programName.replace(/\s+/g, '_')}_export_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Also create CSV for easier viewing
      await exportToCSV(exportData, programName)

      toast.success('Program exported successfully!')
    } catch (error: any) {
      console.error('Error exporting program:', error)
      toast.error(error.message || 'Failed to export program')
    } finally {
      setExporting(false)
    }
  }

  const exportToCSV = async (data: any, programName: string) => {
    try {
      // Create a comprehensive CSV with multiple sheets (as separate files)
      
      // Export Papas
      if (data.papas && data.papas.length > 0) {
        const papasCsv = convertToCSV(data.papas)
        downloadCSV(papasCsv, `${programName}_Papas.csv`)
      }

      // Export Journeys
      if (data.journeys && data.journeys.length > 0) {
        const journeysCsv = convertToCSV(data.journeys)
        downloadCSV(journeysCsv, `${programName}_Journeys.csv`)
      }

      // Export Incidents
      if (data.incidents && data.incidents.length > 0) {
        const incidentsCsv = convertToCSV(data.incidents)
        downloadCSV(incidentsCsv, `${programName}_Incidents.csv`)
      }

      // Export Chat Messages
      if (data.chat_messages && data.chat_messages.length > 0) {
        const chatCsv = convertToCSV(data.chat_messages)
        downloadCSV(chatCsv, `${programName}_Chat.csv`)
      }

      // Export Cheetahs
      if (data.cheetahs && data.cheetahs.length > 0) {
        const cheetahsCsv = convertToCSV(data.cheetahs)
        downloadCSV(cheetahsCsv, `${programName}_Cheetahs.csv`)
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
      const values = headers.map(header => {
        const value = row[header]
        // Handle special characters and commas
        if (value === null || value === undefined) return ''
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
        return `"${stringValue.replace(/"/g, '""')}"`
      })
      csvRows.push(values.join(','))
    }

    return csvRows.join('\n')
  }

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      onClick={handleExport}
      disabled={!canExport || exporting}
      variant={canExport ? 'default' : 'secondary'}
      size="sm"
    >
      {exporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Export Program
        </>
      )}
    </Button>
  )
}
