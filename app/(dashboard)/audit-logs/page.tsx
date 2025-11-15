"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function AuditLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          user_id,
          action,
          target_type,
          target_id,
          changes,
          description,
          created_at,
          users:user_id(full_name, email, oscar, role)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      setLogs(data || [])
    } catch (error: any) {
      console.error('Error loading logs:', error)
      // Show user-friendly message
      if (error?.code === 'PGRST116') {
        console.log('No audit logs table or no data yet')
      }
    } finally {
      setLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      create: 'default',
      update: 'secondary',
      delete: 'destructive',
      login: 'default',
      logout: 'secondary'
    }
    return colors[action.toLowerCase()] || 'secondary'
  }

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
        return '➕'
      case 'update':
        return '✏️'
      case 'delete':
        return '🗑️'
      case 'login':
        return '🔐'
      case 'logout':
        return '👋'
      default:
        return '📝'
    }
  }

  const formatTargetType = (targetType: string) => {
    const formatted: Record<string, string> = {
      users: 'User',
      papas: 'Papa (Guest)',
      programs: 'Program',
      journeys: 'Journey',
      cheetahs: 'Cheetah (Vehicle)',
      theatres: 'Theatre (Venue)',
      nests: 'Nest (Hotel)',
      eagle_squares: 'Eagle Square (Airport)',
      incidents: 'Incident',
      flight_tracking: 'Flight',
      vehicle_locations: 'Vehicle Location',
      title_assignments: 'Title Assignment'
    }
    return formatted[targetType] || targetType
  }

  const getDetailedDescription = (log: any) => {
    const action = log.action?.toLowerCase()
    const targetType = formatTargetType(log.target_type)
    const userName = log.users?.full_name || log.users?.email || 'System'
    const userRole = log.users?.role || ''
    
    let description = ''
    
    switch (action) {
      case 'create':
        description = `${userName} created a new ${targetType}`
        break
      case 'update':
        description = `${userName} updated ${targetType}`
        break
      case 'delete':
        description = `${userName} deleted ${targetType}`
        break
      default:
        description = log.description || `${userName} performed ${action} on ${targetType}`
    }
    
    return description
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground">View system activity and changes</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Activity Logs</span>
          </CardTitle>
          <CardDescription>Complete audit trail of system activities (Last 100 entries)</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No audit logs yet</p>
              <p className="text-xs text-muted-foreground">System activities will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getActionIcon(log.action)}</span>
                      <div className="flex-1">
                        <p className="font-medium text-base mb-1">
                          {getDetailedDescription(log)}
                        </p>
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge variant={getActionColor(log.action) as any} className="text-xs">
                            {log.action?.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatTargetType(log.target_type)}</span>
                        </div>
                        <div className="flex items-center space-x-3 mt-2 text-xs text-muted-foreground">
                          <span>
                            <strong>By:</strong> {log.users?.full_name || log.users?.email || 'System'}
                            {log.users?.oscar && ` (${log.users.oscar})`}
                          </span>
                          {log.users?.role && (
                            <span>
                              <strong>Role:</strong> {log.users.role.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                          {log.target_id && (
                            <span>
                              <strong>ID:</strong> {log.target_id.substring(0, 8)}
                            </span>
                          )}
                        </div>
                        {log.changes && (
                          <details className="text-xs text-muted-foreground mt-2">
                            <summary className="cursor-pointer hover:text-foreground font-medium">📋 View detailed changes</summary>
                            <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto max-h-40 border">
                              {JSON.stringify(log.changes, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
