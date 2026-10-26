'use client'

import { useRef, useState } from 'react'
import { DO_COMPLETION_LABELS, type DOCompletionReason } from '@/lib/duty-workflow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DutyCompletionDialog({ open, onOpenChange, papaName, hasPapa, reasons, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; papaName: string; hasPapa: boolean
  reasons: DOCompletionReason[]; onConfirm: (reason: DOCompletionReason | null) => Promise<boolean>
}) {
  const [reason, setReason] = useState<DOCompletionReason | ''>('')
  const [verified, setVerified] = useState(false)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const chosen = reasons.includes(reason as DOCompletionReason) ? reason as DOCompletionReason : null
  const close = (value: boolean) => { if (!pending) { onOpenChange(value); if (!value) { setReason(''); setVerified(false) } } }
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Confirm duty completion</DialogTitle><DialogDescription>{hasPapa ? `Stay with ${papaName} through the speaking engagement and return escort. Complete only after a verified final checkpoint.` : 'Confirm that this journey and its assigned work are finished.'}</DialogDescription></DialogHeader>
    {hasPapa && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Verified final checkpoint</legend>{reasons.map(value => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm"><input type="radio" name="do-completion-reason" value={value} disabled={pending} checked={chosen === value} onChange={() => { setReason(value); setVerified(false) }} className="mt-0.5 h-4 w-4 accent-primary" /><span>{DO_COMPLETION_LABELS[value]}</span></label>)}{reasons.length === 0 && <p className="text-sm text-muted-foreground">After Papa finishes speaking, select the return escort to the Nest or Eagle Square first.</p>}</fieldset>}
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/40 p-3 text-sm"><input type="checkbox" checked={verified} disabled={pending || (hasPapa && !chosen)} onChange={event => setVerified(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span>{hasPapa ? 'I have personally confirmed this checkpoint and my responsibility for Papa is complete.' : 'I confirm that this journey is complete.'}</span></label>
    <DialogFooter><Button variant="outline" disabled={pending} onClick={() => close(false)}>Keep duty active</Button><Button pending={pending} disabled={!verified || (hasPapa && !chosen)} onClick={async () => { if (submitting.current || !verified || (hasPapa && !chosen)) return; submitting.current = true; setPending(true); try { if (await onConfirm(chosen)) { onOpenChange(false); setReason(''); setVerified(false) } } finally { submitting.current = false; setPending(false) } }}>Complete duty</Button></DialogFooter>
  </DialogContent></Dialog>
}
