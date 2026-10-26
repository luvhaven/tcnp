'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DutyCompletionDialog } from './DutyCompletionDialog'
import { useJourneyStatus } from '@/hooks/useJourneyStatus'
import { dutyCompletionReasons, isTheatreDuty } from '@/lib/duty-workflow'
import { useConfirm } from '@/components/providers/ConfirmProvider'

/** The same verified checkpoint flow in the journey management dialog. */
export function DutyJourneyActions({ journey, onChanged }: { journey: { id: string; destination: string; assigned_theatre_id?: string | null; papas: { full_name: string } | null }; onChanged: () => void }) {
  const { status, returnDestination, startReturn, completeJourney, sending, loading } = useJourneyStatus(journey.id, { onChanged })
  const [open, setOpen] = useState(false)
  const confirm = useConfirm()
  const reasons = dutyCompletionReasons(journey, returnDestination)
  if (!status || ['completed', 'cancelled'].includes(status)) return null
  return <section className="space-y-3 rounded-xl border p-4"><p className="text-sm text-muted-foreground">The DO stays with Papa at the theatre and through the return escort. Duty ends after confirmed Nest settlement or flight departure/landing.</p>
    {(isTheatreDuty(journey) && ['chapman', 'dessert'].includes(status) || returnDestination) && <div className="flex flex-wrap gap-2">{(['nest', 'eagle_square'] as const).map(destination => <Button key={destination} size="sm" variant="outline" disabled={sending || loading || returnDestination === destination} onClick={async () => { if (await confirm({ title: 'Start the return escort?', message: `Confirm Papa has finished speaking and you are staying with him to ${destination === 'nest' ? 'the Nest' : 'Eagle Square'}.`, confirmText: 'Record escort' })) await startReturn(destination) }}>Escort to {destination === 'nest' ? 'Nest' : 'Eagle Square'}</Button>)}</div>}
    <Button disabled={sending || loading || reasons.length === 0} onClick={() => setOpen(true)}>Confirm final duty checkpoint</Button>
    <DutyCompletionDialog key={`${journey.id}:${returnDestination}`} open={open} onOpenChange={setOpen} papaName={journey.papas?.full_name || 'Papa'} hasPapa reasons={reasons} onConfirm={completeJourney} />
  </section>
}
