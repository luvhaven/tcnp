'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpRight, Check, Download, EllipsisVertical, Globe, Info, MonitorDown, PanelBottom,
  Share, SquarePlus, X,
} from 'lucide-react'
import { type PWAPlatform } from '@/hooks/usePWAInstall'
import { useIsClient } from '@/hooks/useIsClient'

interface PWAInstallModalProps {
  platform: PWAPlatform | null
  onClose: () => void
}

type Step = { icon: ReactNode; label: ReactNode }

const ICON = 'h-5 w-5'

/**
 * Shown only when the browser gives a page no way to install itself. Each
 * entry says why this device needs the manual route, then the shortest path.
 */
const CONFIG: Record<PWAPlatform, { title: string; subtitle: string; steps: Step[]; note?: string }> = {
  ios: {
    title: 'Add TCNP to your Home Screen',
    subtitle: 'iPhone and iPad don’t let a website install itself, so it takes three taps.',
    steps: [
      { icon: <Share className={ICON} />, label: <>Tap the <strong>Share</strong> button in your browser’s toolbar</> },
      { icon: <SquarePlus className={ICON} />, label: <>Scroll down and tap <strong>Add to Home Screen</strong></> },
      { icon: <Check className={ICON} />, label: <>Tap <strong>Add</strong> in the top-right corner</> },
    ],
    note: 'Works in Safari, and in Chrome and Edge on iOS 16.4 or later.',
  },
  android: {
    title: 'Install TCNP from your browser menu',
    subtitle: 'This browser didn’t offer one-tap install, so use its menu instead.',
    steps: [
      { icon: <EllipsisVertical className={ICON} />, label: <>Open the browser <strong>menu</strong> (the three dots)</> },
      { icon: <Download className={ICON} />, label: <>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong></> },
      { icon: <Check className={ICON} />, label: <>Tap <strong>Install</strong> to confirm</> },
    ],
    note: 'If TCNP is already installed, open it from your app drawer.',
  },
  'mac-safari': {
    title: 'Add TCNP to your Dock',
    subtitle: 'Safari on Mac installs apps from its own menu, not from the page.',
    steps: [
      { icon: <Share className={ICON} />, label: <>Click <strong>File</strong> in the menu bar, or the <strong>Share</strong> button</> },
      { icon: <PanelBottom className={ICON} />, label: <>Choose <strong>Add to Dock…</strong></> },
      { icon: <Check className={ICON} />, label: <>Click <strong>Add</strong> to confirm</> },
    ],
    note: 'Needs macOS Sonoma (14) or later.',
  },
  'desktop-chrome': {
    title: 'Install TCNP from the address bar',
    subtitle: 'Your browser isn’t offering one-click install right now, so use its own control.',
    steps: [
      { icon: <MonitorDown className={ICON} />, label: <>Click the <strong>install icon</strong> at the right of the address bar</> },
      { icon: <EllipsisVertical className={ICON} />, label: <>Or open the browser <strong>menu</strong> and choose <strong>Install TCNP</strong></> },
      { icon: <Check className={ICON} />, label: <>Click <strong>Install</strong> to confirm</> },
    ],
    note: 'If TCNP is already installed on this computer, open it from your apps instead.',
  },
  'desktop-other': {
    title: 'Open TCNP in Chrome or Edge',
    subtitle: 'This browser can’t install web apps, so TCNP can only run in a tab here.',
    steps: [
      { icon: <Globe className={ICON} />, label: <>Open this page in <strong>Chrome</strong> or <strong>Edge</strong></> },
      { icon: <Download className={ICON} />, label: <>Sign in and click <strong>Install App</strong></> },
    ],
  },
  'in-app': {
    title: 'Open TCNP in your browser first',
    subtitle: 'You’re inside another app’s built-in browser, which can’t install apps.',
    steps: [
      { icon: <EllipsisVertical className={ICON} />, label: <>Open this screen’s <strong>menu</strong> (the three dots)</> },
      { icon: <ArrowUpRight className={ICON} />, label: <>Choose <strong>Open in browser</strong></> },
      { icon: <Download className={ICON} />, label: <>Then tap <strong>Install</strong> again</> },
    ],
  },
}

export function PWAInstallModal({ platform, onClose }: PWAInstallModalProps) {
  const mounted = useIsClient()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!mounted || !platform) return
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const buttons = Array.from(panel.querySelectorAll<HTMLElement>('button'))
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [mounted, platform])

  if (!mounted || !platform) return null

  const config = CONFIG[platform]

  // Portalled to <body>: the header that opens this has a backdrop filter,
  // which would otherwise trap a fixed-position sheet inside the 64px bar.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center">
      <div className="dialog-overlay-in absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog-content-in relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border bg-card text-card-foreground shadow-elevation-xl"
      >
        <div className="flex items-start gap-4 px-6 pb-4 pt-6">
          {/* The real app icon, on white so the crest reads on either theme */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-elevation ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={44} height={44} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold leading-tight">{config.title}</h2>
            <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-muted-foreground">{config.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mx-6 h-px bg-border" />

        <ol className="space-y-4 px-6 py-5">
          {config.steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">{step.icon}</span>
              <span className="flex-1 text-sm leading-relaxed">{step.label}</span>
            </li>
          ))}
        </ol>

        {config.note && (
          <p className="mx-6 mb-5 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {config.note}
          </p>
        )}

        <div className="px-6 pb-6">
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="btn-sheen h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-elevation transition-[filter,scale] duration-fast ease-out hover:brightness-[1.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
