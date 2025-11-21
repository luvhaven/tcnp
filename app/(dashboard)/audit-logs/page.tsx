"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function AuditLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userFilter, setUserFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [entityFilter, setEntityFilter] = useState("all")

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs_readable')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) {
        console.error('Supabase error:', JSON.stringify(error))
        throw error
      }
      
      setLogs(data || [])
    } catch (error: any) {
      console.error('Error loading logs:', JSON.stringify(error))
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
    const userName = log.user_full_name || log.user_email || 'System'
    const userRole = log.user_role || ''
    
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

  const getChangeSummary = (changes: any): string | null => {
    if (!changes || typeof changes !== 'object') return null

    const before = (changes as any).before
    const after = (changes as any).after

    // Simple cases: only "after" (create) or only "before" (delete)
    if (before && !after && typeof before === 'object') {
      return 'Record removed'
    }

    if (!before && after && typeof after === 'object') {
      const keys = Object.keys(after)
      if (keys.length === 0) return 'Record created'
      return `Record created with fields: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? '…' : ''}`
    }

    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
      return null
    }

    const changedKeys = new Set<string>()
    for (const key of Object.keys(before)) {
      if ((before as any)[key] !== (after as any)[key]) {
        changedKeys.add(key)
      }
    }
    for (const key of Object.keys(after)) {
      if ((before as any)[key] !== (after as any)[key]) {
        changedKeys.add(key)
      }
    }

    if (changedKeys.size === 0) return null

    const list = Array.from(changedKeys)
    return `Fields changed: ${list.slice(0, 6).join(', ')}${list.length > 6 ? '…' : ''}`
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false

      if (entityFilter !== "all" && log.target_type !== entityFilter) return false

      if (userFilter.trim().length > 0) {
        const needle = userFilter.trim().toLowerCase()
        const haystack = [
          log.user_full_name,
          log.user_email,
          log.user_oscar,
          log.user_id
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        if (!haystack.includes(needle)) return false
      }

      return true
    })
  }, [logs, actionFilter, entityFilter, userFilter])

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
        <p className="text-muted-foreground">View who did what, when, and where across the system</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Activity Logs</span>
          </CardTitle>
          <CardDescription>Complete audit trail of system activities (Last 200 entries)</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No audit logs yet</p>
              <p className="text-xs text-muted-foreground">System activities will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between text-[11px] sm:text-xs">
                  <div className="flex flex-wrap gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-[11px] text-muted-foreground">Filter by user</span>
                      <input
                        className="h-7 w-44 rounded border bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        placeholder="Name, email, or ID"
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-[11px] text-muted-foreground">Action</span>
                      <select
                        className="h-7 rounded border bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                      >
                        <option value="all">All</option>
                        {Array.from(new Set(logs.map((l) => l.action).filter(Boolean))).map((action: string) => (
                          <option key={action} value={action}>
                            {action.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-[11px] text-muted-foreground">Entity</span>
                      <select
                        className="h-7 rounded border bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                      >
                        <option value="all">All</option>
                        {Array.from(new Set(logs.map((l) => l.target_type).filter(Boolean))).map((entity: string) => (
                          <option key={entity} value={entity}>
                            {entity}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">
                    <span>
                      Showing {filteredLogs.length} of {logs.length} events
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between rounded-lg border p-3 text-xs sm:text-sm bg-card/40"
                  >
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-base sm:text-lg">
                          {getActionIcon(log.action)}
                        </span>
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={getActionColor(log.action) as any}
                              className="text-[11px] px-2 py-0.5"
                            >
                              {log.action?.toUpperCase()}
                            </Badge>
                            <span className="text-[11px] font-medium text-muted-foreground">
                              {formatTargetType(log.target_type)}
                            </span>
                            {log.target_id && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                #{String(log.target_id).slice(0, 8)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm font-medium text-foreground">
                            {getDetailedDescription(log)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                          <span className="font-semibold">User:</span>{" "}
                          {log.user_full_name || log.user_email || "System"}
                          {log.user_oscar && ` (${log.user_oscar})`}
                        </span>
                        {log.user_role && (
                          <span>
                            <span className="font-semibold">Role:</span>{" "}
                            {String(log.user_role).replace(/_/g, " ").toUpperCase()}
                          </span>
                        )}
                        {log.target_type && (
                          <span>
                            <span className="font-semibold">Table:</span>{" "}
                            <span className="font-mono text-[11px]">{log.target_type}</span>
                          </span>
                        )}
                        {log.target_id && (
                          <span>
                            <span className="font-semibold">Record ID:</span>{" "}
                            <span className="font-mono text-[11px] break-all">
                              {log.target_id}
                            </span>
                          </span>
                        )}
                      </div>

                      {log.changes && (
                        (() => {
                          const summary = getChangeSummary(log.changes)
                          if (!summary) return null
                          return (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              <span className="font-semibold">Details:</span>{" "}
                              <span>{summary}</span>
                            </div>
                          )
                        })()
                      )}

                      {log.changes && (
                        <details className="mt-2 text-[11px] text-muted-foreground">
                          <summary className="cursor-pointer select-none hover:text-foreground font-medium flex items-center gap-2">
                            <span>View changes</span>
                            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                              {"JSON"}
                            </span>
                          </summary>
                          <pre className="mt-2 max-h-56 overflow-auto rounded border bg-muted p-3 text-[11px] leading-relaxed">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                      {log.created_at && (
                        <>
                          <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                          <span className="text-[10px] opacity-80">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
