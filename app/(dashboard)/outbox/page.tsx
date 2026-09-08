'use client'

import { useEffect, useState } from 'react'
import { offlineQueue, type QueuedSubmission } from '@/lib/offline-queue'
import { syncService } from '@/lib/sync-service'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, CheckCheck, Inbox, RefreshCw, WifiOff } from 'lucide-react'

const labels: Record<QueuedSubmission['type'], string> = {
  journey: 'Journey', incident: 'Incident report', papa: 'Papa details', program: 'Program',
  chat_message: 'Chat message', journey_update: 'Journey update', journey_event: 'Journey event',
}

export default function OutboxPage() {
  const [entries, setEntries] = useState<QueuedSubmission[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(true)
  const refresh = async () => {
    try { setEntries(await offlineQueue.getAllPending()); setError('') }
    catch { setError('Offline storage could not be read. Your saved submissions have not been deleted.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh(); return syncService.onSync(() => { void refresh() }) }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const retry = async () => {
    setBusy(true)
    try { await syncService.syncAll(); await refresh() }
    catch { setError('Synchronisation could not finish. Your submissions are still saved here. Please try again.') }
    finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-3xl space-y-6 py-4" aria-busy={loading || busy}>
    <header className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Inbox aria-hidden="true" className="h-4 w-4" /> Device storage</p>
      <h1 className="text-3xl font-semibold tracking-tight">Submission outbox</h1>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">Review work waiting to be sent. Submissions stay saved on this device for your account until they synchronise.</p>
    </header>
    {!online && <p role="status" className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm leading-6"><WifiOff aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />You’re offline. Reconnect to send your saved submissions. Keep this browser’s site data to avoid losing unsent work.</p>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => void refresh()}>Reload outbox</Button></div>}
    {loading ? <div role="status" className="space-y-3 rounded-xl border p-6"><span className="sr-only">Loading saved submissions…</span>{[1, 2, 3].map(item => <div key={item} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div> : !error && entries.length === 0 ?
      <div role="status" className="rounded-2xl border bg-card px-6 py-14 text-center">
        <CheckCheck aria-hidden="true" className="mx-auto mb-5 h-9 w-9 text-muted-foreground" />
        <h2 className="text-xl font-semibold tracking-tight">Nothing waiting to send</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">There are no pending submissions for your account on this device.</p>
        <Button asChild variant="outline" className="mt-6"><Link href="/my-operations"><ArrowLeft aria-hidden="true" />Back to my assignments</Link></Button>
      </div> : entries.length > 0 && <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/30 p-4 sm:px-6">
          <p role="status" className="text-sm font-medium">{entries.length} pending {entries.length === 1 ? 'submission' : 'submissions'}</p>
          <Button onClick={retry} disabled={busy || !online}><RefreshCw aria-hidden="true" className={busy ? 'animate-spin' : ''} />{busy ? 'Synchronising…' : 'Retry submissions'}</Button>
        </div>
        <ul className="divide-y">{entries.map(entry => <li key={entry.id} className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{labels[entry.type] || 'Saved submission'}</h2><span className={`rounded-md px-2 py-1 text-xs font-medium ${entry.isEmergency ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{entry.isEmergency ? 'Emergency' : entry.retries ? 'Retry needed' : 'Waiting to send'}</span></div>
          <p className="text-sm leading-6 text-muted-foreground">Saved <time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time>{entry.retries > 0 && ` · ${entry.retries} unsuccessful ${entry.retries === 1 ? 'attempt' : 'attempts'}`}</p>
          {entry.retries > 0 && <p className="text-sm leading-6">This submission hasn’t been sent. Retry when connected; if it keeps failing, contact your administrator.</p>}
          <details><summary className="w-fit cursor-pointer rounded py-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">View saved data</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 text-xs leading-5">{JSON.stringify(entry.data, null, 2)}</pre></details>
        </li>)}</ul>
      </div>}
  </section>
}
