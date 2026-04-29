'use client'

import { type PWAPlatform } from '@/hooks/usePWAInstall'

interface PWAInstallModalProps {
  platform: PWAPlatform | null
  onClose: () => void
}

// ── SVG icons (self-contained, no external deps) ─────────────────────────────

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)

const PlusSquareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const MenuDotsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
)

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const DockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <path d="M6 14V4a2 2 0 012-2h8a2 2 0 012 2v10" />
  </svg>
)

// ── Step type ─────────────────────────────────────────────────────────────────

type Step = { icon: React.ReactNode; label: React.ReactNode }

const IOS_STEPS: Step[] = [
  {
    icon: <ShareIcon />,
    label: (
      <>
        Tap the <strong>Share</strong> button{' '}
        <span className="inline-flex items-center justify-center rounded bg-blue-500 text-white p-0.5 mx-0.5 align-middle">
          <ShareIcon />
        </span>{' '}
        at the bottom of <strong>Safari</strong>
      </>
    ),
  },
  {
    icon: <PlusSquareIcon />,
    label: (
      <>
        Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>
      </>
    ),
  },
  {
    icon: <CheckIcon />,
    label: (
      <>
        Tap <strong>&ldquo;Add&rdquo;</strong> in the top-right corner
      </>
    ),
  },
]

const ANDROID_STEPS: Step[] = [
  {
    icon: <MenuDotsIcon />,
    label: (
      <>
        Tap the <strong>⋮</strong> menu (three dots) in Chrome
      </>
    ),
  },
  {
    icon: <HomeIcon />,
    label: (
      <>
        Tap <strong>&ldquo;Add to Home screen&rdquo;</strong> or{' '}
        <strong>&ldquo;Install app&rdquo;</strong>
      </>
    ),
  },
  {
    icon: <CheckIcon />,
    label: (
      <>
        Tap <strong>&ldquo;Install&rdquo;</strong> in the dialog
      </>
    ),
  },
]

const MAC_SAFARI_STEPS: Step[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <rect x="3" y="3" width="18" height="13" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="20" x2="16" y2="20" />
        <line x1="12" y1="16" x2="12" y2="20" />
      </svg>
    ),
    label: (
      <>
        Click <strong>File</strong> in the macOS menu bar
      </>
    ),
  },
  {
    icon: <DockIcon />,
    label: (
      <>
        Select <strong>&ldquo;Add to Dock&hellip;&rdquo;</strong>
      </>
    ),
  },
  {
    icon: <CheckIcon />,
    label: (
      <>
        Click <strong>&ldquo;Add&rdquo;</strong> to confirm
      </>
    ),
  },
]

const DESKTOP_STEPS: Step[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    label: (
      <>
        Look for the <strong>install icon ⊕</strong> in the address bar (Chrome / Edge)
      </>
    ),
  },
  {
    icon: <CheckIcon />,
    label: (
      <>
        Click it and choose <strong>&ldquo;Install&rdquo;</strong>
      </>
    ),
  },
]

const CONFIG: Record<
  PWAPlatform,
  { title: string; subtitle: string; steps: Step[]; note?: string }
> = {
  ios: {
    title: 'Install on iPhone / iPad',
    subtitle: 'Add TCNP to your Home Screen for instant, full-screen access.',
    steps: IOS_STEPS,
    note: 'Must use Safari. Chrome / Firefox on iOS do not support installation.',
  },
  android: {
    title: 'Install on Android',
    subtitle: 'Install TCNP as a native app for fast, offline-ready access.',
    steps: ANDROID_STEPS,
  },
  'mac-safari': {
    title: 'Install on Mac (Safari)',
    subtitle: 'Add TCNP to your Dock for one-click access from your desktop.',
    steps: MAC_SAFARI_STEPS,
    note: 'Requires macOS Sonoma (14) or later with Safari 17+.',
  },
  'desktop-chrome': {
    title: 'Install on Desktop',
    subtitle: 'Install TCNP as a standalone app for the best experience.',
    steps: DESKTOP_STEPS,
  },
  'desktop-other': {
    title: 'Install on Desktop',
    subtitle: 'For the best experience, open in Chrome or Edge to install.',
    steps: DESKTOP_STEPS,
    note: 'Chrome and Edge provide the best PWA installation support on desktop.',
  },
}

export function PWAInstallModal({ platform, onClose }: PWAInstallModalProps) {
  if (!platform) return null

  const config = CONFIG[platform]

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border shadow-2xl shadow-black/30 animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          {/* App icon placeholder */}
          <div className="flex-shrink-0 h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-md">
            <span className="text-2xl font-black text-primary-foreground">T</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight">{config.title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{config.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px bg-border" />

        {/* Steps */}
        <ol className="px-6 py-5 space-y-4">
          {config.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-4">
              {/* Step number */}
              <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              {/* Icon */}
              <span className="flex-shrink-0 text-muted-foreground mt-0.5">
                {step.icon}
              </span>
              {/* Label */}
              <span className="text-sm leading-relaxed flex-1">{step.label}</span>
            </li>
          ))}
        </ol>

        {/* Note */}
        {config.note && (
          <div className="mx-6 mb-5 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              ℹ️ {config.note}
            </p>
          </div>
        )}

        {/* Close button */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold py-3 hover:bg-primary/90 active:scale-95 transition-all duration-150"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
