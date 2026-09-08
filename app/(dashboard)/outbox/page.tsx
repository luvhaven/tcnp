'use client'

import { useEffect, useState } from 'react'
import { offlineQueue, type QueuedSubmission } from '@/lib/offline-queue'
import { syncService } from '@/lib/sync-service'
import { Button } from '@/components/ui/button'

export default function OutboxPage() {
  const [entries, setEntries] = useState<QueuedSubmission[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => {
    try { setEntries(await offlineQueue.getAllPending()); setError('') }
    catch { setError('Offline storage could not be read. Your saved submissions have not been deleted.') }
  }
  useEffect(() => { void refresh(); return syncService.onSync(() => { void refresh() }) }, [])
  const retry = async () => {
    setBusy(true)
    try { await syncService.syncAll(); await refresh() } finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-3xl space-y-5 p-4">
    <h1 className="text-2xl font-semibold">Submission outbox</h1>
    <p className="text-sm text-muted-foreground">These submissions are saved on this device for your account. Failed submissions remain here until they synchronise.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button onClick={retry} disabled={busy}>{busy ? 'Synchronising…' : 'Retry pending submissions'}</Button>
    {entries.length === 0 && <p role="status">No pending submissions for your account on this device.</p>}
    <ul className="divide-y rounded-lg border">{entries.map(entry => <li key={entry.id} className="space-y-2 p-4">
      <p className="font-medium">{entry.type.replaceAll('_', ' ')} {entry.isEmergency ? '— emergency' : ''}</p>
      <p className="text-sm text-muted-foreground">Saved {new Date(entry.timestamp).toLocaleString()} · {entry.retries ? `Needs attention (${entry.retries} failed attempts)` : 'Waiting to synchronise'}</p>
      <details><summary className="cursor-pointer text-sm underline">Review saved submission</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(entry.data, null, 2)}</pre></details>
    </li>)}</ul>
  </section>
}
