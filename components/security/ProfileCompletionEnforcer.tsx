"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { computeProfileCompletion } from "@/lib/profile-completion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CompletionRing } from "@/components/profile/CompletionRing"
import { UserCog, ArrowRight } from "lucide-react"

const SNOOZE_KEY = "profile-completion-snoozed"

/**
 * Nudges users (especially earlier signups) to complete their profile.
 * Non-blocking by design — operational continuity beats a hard wall — but the
 * prompt returns every session until the required fields are filled.
 */
export function ProfileCompletionEnforcer() {
  const { data: currentUser, isLoading } = useCurrentUser()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isLoading || !currentUser) return
    if (currentUser.profile_completed_at) return

    const result = computeProfileCompletion(currentUser)
    if (result.isComplete) return

    // Snooze lasts for the browser session only, so it re-nudges next login
    let snoozed = false
    try { snoozed = sessionStorage.getItem(SNOOZE_KEY) === "1" } catch { /* private mode */ }
    if (!snoozed) {
      const t = setTimeout(() => setOpen(true), 1200)
      return () => clearTimeout(t)
    }
  }, [currentUser, isLoading])

  if (!currentUser) return null
  const result = computeProfileCompletion(currentUser)

  const snooze = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, "1") } catch { /* ignore */ }
    setOpen(false)
  }

  const goComplete = () => {
    setOpen(false)
    router.push("/profile")
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) snooze() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" /> Complete your profile
          </DialogTitle>
          <DialogDescription>
            Your profile is missing a few required details. Command uses these to coordinate
            operations and reach you in an emergency.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-5 py-2">
          <CompletionRing percent={result.percent} size={96} strokeWidth={9} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Still needed:</p>
            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {result.missingRequired.slice(0, 5).map(s => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {s.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={snooze}>Later</Button>
          <Button className="flex-1 gap-2" onClick={goComplete}>
            Complete now <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
