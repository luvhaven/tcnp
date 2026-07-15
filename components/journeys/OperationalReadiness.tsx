"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  ClipboardCheck, Calendar, Users, Car, Landmark, Plane, Hotel,
  CheckCircle2, AlertCircle, ChevronDown, ArrowRight,
} from "lucide-react"

/**
 * Operational Readiness — the architecture rule made visible.
 *
 * TCNP registries are owned by their units and created ONLY in their own pages:
 *   Programs → Command/Admin (Programs)      Papas → Command/Admin (Papas)
 *   Cheetahs → Tango Oscar (Tango)           Theatres → Victor Oscar (Victor)
 *   Eagle Squares → Alpha Oscar (Alpha)      Nests → November Oscar (NOscar)
 *
 * Journeys COMPOSE these records — they never create them inline. When a
 * registry is empty, this panel routes the planner to the owning unit instead
 * of leaving them staring at an empty dropdown.
 */

type ReadinessItem = {
  label: string
  count: number
  required: boolean
  href: string
  owner: string
  icon: React.ComponentType<{ className?: string }>
}

type Props = {
  programs: number
  papas: number
  cheetahs: number
  nests: number
  eagleSquares: number
}

export default function OperationalReadiness({ programs, papas, cheetahs, nests, eagleSquares }: Props) {
  const items: ReadinessItem[] = [
    { label: "Programs", count: programs, required: true, href: "/programs", owner: "Command / Admin", icon: Calendar },
    { label: "Papas", count: papas, required: true, href: "/papas", owner: "Command / Admin", icon: Users },
    { label: "Cheetahs", count: cheetahs, required: true, href: "/tango", owner: "Tango Oscar", icon: Car },
    { label: "Eagle Squares", count: eagleSquares, required: false, href: "/alpha", owner: "Alpha Oscar", icon: Plane },
    { label: "Nests", count: nests, required: false, href: "/nests", owner: "November Oscar", icon: Hotel },
  ]

  const missingRequired = items.filter(i => i.required && i.count === 0)
  const missingOptional = items.filter(i => !i.required && i.count === 0)
  const allReady = missingRequired.length === 0 && missingOptional.length === 0

  // Fully ready → stay out of the way entirely
  const [expanded, setExpanded] = useState(missingRequired.length > 0)
  if (allReady) return null

  return (
    <div
      className={cn(
        "rounded-xl border",
        missingRequired.length > 0
          ? "border-amber-400/60 bg-amber-500/5"
          : "border-border bg-muted/30"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            missingRequired.length > 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
          )}>
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {missingRequired.length > 0
                ? "Operational readiness — journeys need these registries first"
                : "Operational readiness — optional registries still empty"}
            </p>
            <p className="text-xs text-muted-foreground">
              Registries are owned by their units; journeys compose them, they never create them.
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="grid gap-2 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...missingRequired, ...missingOptional, ...items.filter(i => i.count > 0)].map(item => {
            const ready = item.count > 0
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg border p-3 transition-colors",
                  ready ? "opacity-70 hover:opacity-100" : "border-amber-400/50 hover:border-amber-400 hover:bg-amber-500/5"
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", ready ? "text-muted-foreground" : "text-amber-500")} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {item.label}
                    {item.required && !ready && (
                      <Badge variant="outline" className="border-amber-400/60 text-[9px] uppercase text-amber-600 dark:text-amber-400">required</Badge>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">Owned by {item.owner}</p>
                </div>
                {ready ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {item.count}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" /> Set up
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
