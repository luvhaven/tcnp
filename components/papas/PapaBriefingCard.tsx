'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { notifyError, UserFacingError } from '@/lib/notify'
import { Edit2, Save, X, CheckCircle, User, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { type RoleBriefingConfig, type PapaField } from '@/lib/constants/papaBriefingFields'
import { PapaPassportPanel, type PapaPassportState } from '@/components/papas/PapaDetailsView'
import type { PapaPrivateDetails } from '@/lib/papa-privacy'

// ── Types ────────────────────────────────────────────────────────────────────

export type PapaBriefingPapa = {
  id: string
  full_name: string
  title?: string | null
  profile_photo_url?: string | null
  organization?: string | null
  position?: string | null
  [key: string]: any // all the flexible Papa columns
}

interface PapaBriefingCardProps {
  papa: PapaBriefingPapa
  config: RoleBriefingConfig
  canEdit: boolean // true if the viewing user is a team lead
  /**
   * Restricted passport details (papa_private_details). Passed only when the
   * viewer may see them (can_view_papa_passport) and the config shows them.
   */
  passport?: PapaPassportState
  canEditPassport?: boolean
  onPassportSaved?: (details: PapaPrivateDetails) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderValue(field: PapaField, value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/50 italic text-xs">Not specified</span>
  }

  switch (field.type) {
    case 'boolean':
      return value ? (
        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-sm">
          <CheckCircle className="h-3.5 w-3.5" /> Yes
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">No</span>
      )
    case 'datetime':
      try {
        return <span className="text-sm font-medium">{format(new Date(value), 'dd MMM yyyy, HH:mm')}</span>
      } catch {
        return <span className="text-sm">{value}</span>
      }
    case 'jsonb':
      if (Array.isArray(value)) {
        return (
          <div className="space-y-1">
            {value.map((item: any, i: number) => (
              <div key={i} className="text-xs bg-muted rounded px-2 py-1">
                {typeof item === 'object' ? JSON.stringify(item) : String(item)}
              </div>
            ))}
          </div>
        )
      }
      if (typeof value === 'object') {
        return (
          <pre className="text-xs bg-muted rounded px-2 py-1 whitespace-pre-wrap break-words">
            {JSON.stringify(value, null, 2)}
          </pre>
        )
      }
      return <span className="text-sm">{String(value)}</span>
    default:
      return <span className="text-sm font-medium">{String(value)}</span>
  }
}

// ── Editable field renderer ───────────────────────────────────────────────────

function EditableField({
  field,
  value,
  onChange,
}: {
  field: PapaField
  value: any
  onChange: (key: string, val: any) => void
}) {
  if (field.type === 'boolean') {
    return (
      <Select
        value={value === true ? 'yes' : value === false ? 'no' : ''}
        onValueChange={(v) => onChange(field.key, v === 'yes')}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <Select value={value ?? ''} onValueChange={(v) => onChange(field.key, v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        rows={2}
        className="text-sm resize-none"
      />
    )
  }

  if (field.type === 'number') {
    return (
      <Input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value ? Number(e.target.value) : null)}
        className="h-8 text-sm"
      />
    )
  }

  // text / datetime default
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => onChange(field.key, e.target.value)}
      className="h-8 text-sm"
      placeholder={field.hint}
    />
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PapaBriefingCard({ papa: papaProp, config, canEdit, passport, canEditPassport = false, onPassportSaved }: PapaBriefingCardProps) {
  // Saved edits overlay the row we were given (props are never mutated).
  const [savedValues, setSavedValues] = useState<Record<string, any>>({})
  const papa: PapaBriefingPapa = { ...papaProp, ...savedValues }
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Record<string, any>>({})

  const editableSet = new Set(config.editableFields)

  const startEdit = () => {
    // Pre-fill draft with current values of editable fields
    const initial: Record<string, any> = {}
    for (const key of config.editableFields) {
      initial[key] = papa[key] ?? null
    }
    setDraft(initial)
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft({})
    setEditing(false)
  }

  const handleChange = (key: string, value: any) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/papas/${papa.id}/role-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!res.ok) throw new UserFacingError(json.error || 'Save failed')

      toast.success(`Briefing updated — ${json.updated?.length ?? 0} field(s) saved`)
      // Update local view without full reload
      setSavedValues((prev) => ({ ...prev, ...draft }))
      setEditing(false)
      setDraft({})
    } catch (err: any) {
      notifyError(err, 'Failed to save briefing')
    } finally {
      setSaving(false)
    }
  }

  // Check if there's any meaningful data for this role
  const hasData = config.viewFields.some((f) => {
    const val = papa[f.key]
    return val !== null && val !== undefined && val !== '' &&
      !(Array.isArray(val) && val.length === 0)
  })

  return (
    <Card className={cn(
      'transition-all duration-200 hover:shadow-md',
      editing && 'ring-2 ring-primary/30 shadow-md'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {papa.profile_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={papa.profile_photo_url}
                alt={papa.full_name}
                className="h-10 w-10 rounded-full object-cover border"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">
                {papa.title ? `${papa.title} ` : ''}{papa.full_name}
              </CardTitle>
              {(papa.organization || papa.position) && (
                <CardDescription className="text-xs">
                  {[papa.position, papa.organization].filter(Boolean).join(' · ')}
                </CardDescription>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!hasData && !editing && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                No data yet
              </Badge>
            )}
            {canEdit && !editing && (
              <Button size="sm" variant="outline" onClick={startEdit} className="min-h-11 gap-1 text-xs sm:min-h-8" aria-label={`Edit briefing for ${papa.full_name}`}>
                <Edit2 className="h-3 w-3" aria-hidden="true" /> Edit
              </Button>
            )}
            {editing && (
              <>
                <Button size="sm" variant="outline" onClick={cancelEdit} className="min-h-11 gap-1 text-xs sm:min-h-8" disabled={saving}>
                  <X className="h-3 w-3" aria-hidden="true" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} className="min-h-11 gap-1 text-xs sm:min-h-8" disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {config.viewFields.map((field) => {
            const isEditable = editing && editableSet.has(field.key)
            const value = editing && editableSet.has(field.key) ? draft[field.key] : papa[field.key]

            return (
              <div
                key={field.key}
                className={cn(
                  'space-y-1',
                  field.type === 'textarea' || field.type === 'jsonb' ? 'sm:col-span-2' : ''
                )}
              >
                <Label className={cn('text-xs font-medium', isEditable ? 'text-primary' : 'text-muted-foreground')}>
                  {field.label}
                  {isEditable && <span className="ml-1 text-primary">*</span>}
                </Label>
                {isEditable ? (
                  <EditableField field={field} value={value} onChange={handleChange} />
                ) : (
                  <div className="min-h-[1.5rem]">
                    {renderValue(field, value)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {passport && (
          <PapaPassportPanel
            papaId={papa.id}
            papaName={papa.full_name}
            state={passport}
            canEdit={canEditPassport}
            onSaved={onPassportSaved}
            className="rounded-lg border border-amber-500/30 bg-amber-500/[0.03] p-3"
          />
        )}
      </CardContent>
    </Card>
  )
}
