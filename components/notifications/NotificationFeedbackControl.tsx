'use client'

import { useSyncExternalStore } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { audioManager } from '@/lib/audio/AudioManager'
import { feedbackSnapshot, feedbackServerSnapshot, subscribeFeedback, setFeedbackPreferences, playNotificationFeedback, type FeedbackPreferences, type NotificationTone } from '@/lib/notification-feedback'

const noSubscription = () => () => {}
const vibrationSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export function NotificationFeedbackControl() {
  const preferences: FeedbackPreferences = JSON.parse(useSyncExternalStore(subscribeFeedback, feedbackSnapshot, feedbackServerSnapshot))
  const muted = useSyncExternalStore(audioManager.subscribe, audioManager.getMuted, () => false)
  const canVibrate = useSyncExternalStore(noSubscription, vibrationSupported, () => false)
  return <div className="space-y-5 border-t pt-5">
    <div className="space-y-2">
      <Label htmlFor="notification-tone">Notification sound</Label>
      <div className="flex flex-wrap gap-2">
        <select id="notification-tone" value={preferences.tone} onChange={event => setFeedbackPreferences({ tone: event.target.value as NotificationTone })} aria-describedby="notification-tone-description" className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-base text-foreground sm:text-sm">
          <option value="signature">TCNP signature</option><option value="soft">Soft bell</option><option value="clear">Clear notes</option>
        </select>
        <Button type="button" variant="outline" disabled={muted} onClick={() => playNotificationFeedback()}><Volume2 className="mr-2 h-4 w-4" aria-hidden />Preview sound</Button>
      </div>
      <p id="notification-tone-description" className="text-xs text-muted-foreground">{muted ? 'Turn on App sounds to preview. ' : ''}Custom tones play while TCNP is open. Mentions and operational alerts retain their distinct cues. Saved automatically on this device.</p>
    </div>
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1"><Label htmlFor="notification-vibration">In-app vibration</Label><p id="notification-vibration-description" className="text-xs text-muted-foreground">{canVibrate ? 'Short, gentle pulses for new updates. Emergency alerts keep their existing vibration.' : 'This browser does not expose vibration to web apps. System notification vibration follows your device settings.'}</p></div>
      <Switch id="notification-vibration" checked={canVibrate && preferences.vibration} disabled={!canVibrate} onCheckedChange={vibration => setFeedbackPreferences({ vibration })} aria-describedby="notification-vibration-description" />
    </div>
    <p className="text-xs text-muted-foreground">When TCNP is closed, banner style, sounds and vibration are controlled by your phone or computer. Allow banners and sounds in its notification settings. On iPhone and iPad, install TCNP on the Home Screen to receive Web Push.</p>
  </div>
}
