"use client"

import { useState } from "react"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Props = { isLead: boolean }

const MEMBER_STEPS = [
  ["Get on the programme", "Answer the availability request when it comes. The Den head adds you to the programme; until then you can see the team but not the programme's work."],
  ["Check your work", "Your tasks and shifts appear under “My Den work” on the Dashboard. Mark a task done there or on the Tasks tab."],
  ["Check in", "Check in from two hours before your shift until it ends, from the Dashboard or the Roster tab, and check out when you leave."],
  ["Serve the floor", "If the Den head gave you floor access, publish menus and take guests’ meal orders on the Menus & Orders tab. Record stock you use on the Inventory tab."],
  ["Write down what you learn", "Add a note to a guest on the Guests tab, and write a field report on the Reports tab. The next team will read them."],
] as const

const LEAD_STEPS = [
  ["Open the plan", "Choose the programme, open the Den plan, and copy the set-up from the last programme instead of starting blank."],
  ["Build the team", "On the Overview tab, add the officers who said they are available. Anyone else goes to leadership for approval. Then switch on floor access for those who will serve."],
  ["Set the work", "Assign tasks with deadlines, start checklists from templates, and build the roster. Officers are notified, and reminded before tasks fall due."],
  ["Watch readiness", "The Programme plan tab scores how ready the Den is and links to whatever is missing. Download the run sheet for the day."],
  ["Close it out", "After the programme, write the post-operation report. Submitting it files it in the repository, so its lessons are found next time."],
] as const

/** A short, role-aware guide, so a new officer can start without a briefing. */
export default function DenGuide({ isLead }: Props) {
  const [open, setOpen] = useState(false)
  const steps = isLead ? LEAD_STEPS : MEMBER_STEPS
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
        How it works
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isLead ? "Running a programme in the Den" : "Working in the Den"}</DialogTitle>
            <DialogDescription>Five steps, in the order they happen.</DialogDescription>
          </DialogHeader>
          <ol className="mt-2 space-y-3">
            {steps.map(([title, text], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">{index + 1}</span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex justify-end"><Button onClick={() => setOpen(false)}>Got it</Button></div>
        </DialogContent>
      </Dialog>
    </>
  )
}
