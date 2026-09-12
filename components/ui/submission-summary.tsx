function readable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(readable).join(', ') || 'None'
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${readable(item)}`).join('; ')
  return String(value)
}

export function SubmissionSummary({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return <p className="text-sm">{readable(data)}</p>
  const fields = Object.entries(data).filter(([key]) => !key.endsWith('_id') && key !== 'id')
  return <dl className="grid gap-3 rounded-lg bg-muted/30 p-4 sm:grid-cols-2">{fields.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs capitalize text-muted-foreground">{key.replaceAll('_', ' ')}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{readable(value)}</dd></div>)}{fields.length === 0 && <p className="text-sm text-muted-foreground">This submission contains record references only. Open technical details for its identifiers.</p>}</dl>
}
