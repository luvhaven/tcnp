'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, BellRing, CheckCircle2, Download, Globe, Laptop, LockKeyhole, MapPinned, Monitor, Radio, Route, ShieldCheck, Smartphone, TabletSmartphone, Users,
} from 'lucide-react'
import { PhoneMockup } from '@/components/landing/PhoneMockup'
import { PWAInstallModal } from '@/components/pwa/PWAInstallModal'
import { usePWAInstall, type PWAPlatform } from '@/hooks/usePWAInstall'
import { useBrowserSnapshot } from '@/hooks/useBrowserSnapshot'
import { isDesktopShell, isNativeShell } from '@/lib/native-shell'
import { isInstalledOnThisDevice } from '@/lib/pwa-install'

type Device = 'android' | 'ios' | 'windows' | 'mac'

export interface LandingPageProps {
  /** Direct link to the native Android app (.apk), once it has been built. */
  androidUrl?: string | null
  /** App Store or TestFlight link for the native iPhone app, once it exists. */
  iosUrl?: string | null
  /** Direct link to the Windows installer (.exe) built from desktop/. */
  windowsUrl?: string | null
  /** Direct link to the Mac app (.dmg) built from desktop/. */
  macUrl?: string | null
  version: string
}

const UNITS = ['Command', 'Alpha', 'Tango', 'Victor', 'November · Nest', 'November · Den', 'Echo', 'Serial', 'Welfare', 'Compliance', 'Training']

function detectDevice(): Device | null {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows/.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  return null
}

/** The manual steps to show when a visitor picks a device they are not on. */
const STEPS_FOR: Record<Device, PWAPlatform> = { android: 'android', ios: 'ios', windows: 'desktop-chrome', mac: 'mac-safari' }

export function LandingPage({ androidUrl, iosUrl, windowsUrl, macUrl, version }: LandingPageProps) {
  const router = useRouter()
  const { isInstalled, install, platform } = usePWAInstall()
  const device = useBrowserSnapshot<Device | null>(detectDevice, null)
  const [steps, setSteps] = useState<PWAPlatform | null>(null)
  const [busy, setBusy] = useState<Device | 'hero' | 'web' | null>(null)
  // TCNP is already installed here, though this visit is in a browser tab. The
  // browser will not offer to install it again, so the page offers to open it.
  const [hasApp, setHasApp] = useState(false)
  useEffect(() => {
    let live = true
    void isInstalledOnThisDevice().then(installed => { if (live && installed) setHasApp(true) })
    return () => { live = false }
  }, [])

  // Someone opening the installed app (Home Screen or native) is here to work,
  // not to read a brochure: take them straight to sign-in.
  useEffect(() => {
    if (isInstalled || isNativeShell() || isDesktopShell()) router.replace('/login')
  }, [isInstalled, router])

  const native: Record<Device, string | null> = { android: androidUrl || null, ios: iosUrl || null, windows: windowsUrl || null, mac: macUrl || null }

  /** Install for the device the visitor is on; otherwise show that device's steps. */
  const get = async (target: Device, from: Device | 'hero') => {
    const link = native[target]
    if (link) { window.location.assign(link); return }
    if (target !== device) { setSteps(STEPS_FOR[target]); return }
    if (hasApp) { router.push('/login'); return }
    setBusy(from)
    try {
      if (await install() === 'show-instructions') setSteps(platform ?? STEPS_FOR[target])
    } finally { setBusy(null) }
  }

  /**
   * The web app (PWA) is always on offer, whatever native downloads exist: it
   * needs no store, works on every device, and is what officers already use.
   */
  const installWeb = async () => {
    if (hasApp) { router.push('/login'); return }
    setBusy('web')
    try {
      if (await install() === 'show-instructions') setSteps(platform ?? (device ? STEPS_FOR[device] : 'desktop-other'))
    } finally { setBusy(null) }
  }

  const heroLabel = hasApp && !(device && native[device]) ? 'Open TCNP'
    : device === 'android' ? (native.android ? 'Download for Android' : 'Install on Android')
    : device === 'ios' ? (native.ios ? 'Get it for iPhone' : 'Install on iPhone')
    : device === 'windows' ? (native.windows ? 'Download for Windows' : 'Install on Windows')
    : device === 'mac' ? (native.mac ? 'Download for Mac' : 'Install on Mac')
    : 'Get the app'

  const downloads: { id: Device; name: string; icon: ReactNode; line: string; action: string; tag: string; note?: string }[] = [
    {
      id: 'android', name: 'Android', icon: <Smartphone className="h-7 w-7" />,
      line: native.android ? 'The full app. Shares your location even with the phone locked.' : 'Installs from Chrome in one tap. The full app with locked-screen tracking is on its way.',
      action: native.android ? 'Download .apk' : 'Install', tag: native.android ? 'Native app' : 'Available now',
      // The app comes from this site, not Google Play, so Android asks first.
      // Alerts with the app closed are not built into it yet, and saying so
      // here stops an officer swapping the web app for it and missing them.
      note: native.android ? 'Open the downloaded file and, when Android asks, allow your browser to install apps. Alerts while the app is closed are coming in an update; keep the web app too if you rely on them.' : undefined,
    },
    {
      id: 'ios', name: 'iPhone & iPad', icon: <TabletSmartphone className="h-7 w-7" />,
      line: native.ios ? 'The full app. Shares your location even with the phone locked.' : 'Add it to your Home Screen from Safari. The full App Store app is on its way.',
      action: native.ios ? 'Open in App Store' : 'Show me how', tag: native.ios ? 'Native app' : 'Available now',
    },
    {
      id: 'windows', name: 'Windows', icon: <Monitor className="h-7 w-7" />,
      line: native.windows ? 'A real Windows program. Run the installer and TCNP is in your Start menu, with its own window and alerts.' : 'Installs from Edge or Chrome with its own window, taskbar icon and alerts.',
      action: native.windows ? 'Download installer' : 'Install', tag: native.windows ? 'Desktop app' : 'Available now',
      // The installer is not yet signed with a paid certificate, so Windows asks first.
      note: native.windows ? 'If Windows shows “Windows protected your PC”, choose More info, then Run anyway.' : undefined,
    },
    {
      id: 'mac', name: 'Mac', icon: <Laptop className="h-7 w-7" />,
      line: native.mac ? 'A real Mac app. Open the download and drag TCNP into Applications.' : 'Installs from Chrome, Edge or Safari and lives in your Dock.',
      action: native.mac ? 'Download for Mac' : 'Install', tag: native.mac ? 'Desktop app' : 'Available now',
    },
  ]

  return (
    <div className="landing min-h-dvh">
      {/* ── Navigation ─────────────────────────────────────────── */}
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8" aria-label="Main">
          <Link href="/" className="flex items-center gap-3 rounded-lg">
            <Image src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]" priority />
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-tight">TCN Protocol</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">Central</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <a href="#download" className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:text-white sm:block">Download</a>
            <Link href="/login" className="landing-ghost rounded-full px-5 py-2.5 text-sm font-semibold">Sign in</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden pb-16 pt-28">
          <div className="absolute inset-0 -z-10">
            <Image src="/tcnp_cinematic_bg.png" alt="" fill priority sizes="100vw" className="landing-hero-image object-cover object-[62%_center] saturate-[1.15]" />
            <div className="landing-aurora absolute inset-0" />
            <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,7,12,0.94)_0%,rgba(5,7,12,0.72)_38%,rgba(5,7,12,0.18)_70%,rgba(5,7,12,0.45)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#05070c] to-transparent" />
          </div>

          <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              <p className="landing-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
                The Covenant Nation Protocol team
              </p>
              <h1 className="landing-rise landing-rise-2 mt-6 text-[2.75rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Every arrival,
                <span className="block bg-gradient-to-r from-[#ffb347] via-[#ff8a3d] to-[#f26522] bg-clip-text text-transparent">in sight.</span>
              </h1>
              <p className="landing-rise landing-rise-3 mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
                Journeys, live tracking and alerts for every officer, from the airport apron to the theatre door. One app, on every device you carry.
              </p>
              <div className="landing-rise landing-rise-4 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => void get(device ?? 'windows', 'hero')} disabled={busy === 'hero'} className="landing-cta inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full px-8 text-base font-bold text-white disabled:opacity-70">
                  {hasApp && !(device && native[device]) ? <ArrowRight className="h-5 w-5" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
                  {busy === 'hero' ? 'Opening…' : heroLabel}
                </button>
                <Link href="/login" className="landing-ghost inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-7 text-base font-semibold">
                  Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <p className="landing-rise landing-rise-4 mt-5 flex items-center gap-2 text-sm text-white/55">
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                {hasApp ? 'TCNP is already installed on this device. You can also open it from your apps.' : 'Members only. Every account is approved by Command.'}
              </p>
            </div>
            <PhoneMockup className="landing-rise landing-rise-3 justify-self-center lg:justify-self-end" />
          </div>
        </section>

        {/* ── Units ────────────────────────────────────────────── */}
        <section aria-label="Units" className="relative border-y border-white/10 bg-white/[0.02] py-5">
          <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <ul className="landing-marquee flex shrink-0 items-center gap-10 pr-10 text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
              {[...UNITS, ...UNITS].map((unit, index) => (
                <li key={`${unit}-${index}`} aria-hidden={index >= UNITS.length} className="flex items-center gap-10 whitespace-nowrap">
                  {unit}<span className="h-1 w-1 rounded-full bg-[#f26522]" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Download ─────────────────────────────────────────── */}
        <section id="download" className="relative mx-auto max-w-7xl scroll-mt-10 px-5 py-24 sm:px-8">
          <div className="absolute left-1/2 top-10 -z-10 h-72 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(242,101,34,0.22),transparent)] blur-2xl" />
          <h2 className="text-center text-4xl font-extrabold tracking-tight sm:text-5xl">Get TCNP on your device</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-white/65">Pick yours. It takes under a minute, and you sign in with the account you already have.</p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {downloads.map(item => {
              const mine = item.id === device
              const installed = mine && hasApp && !native[item.id]
              return (
                <article key={item.id} className={`landing-card relative flex flex-col rounded-3xl p-6 ${mine ? 'ring-2 ring-[#f26522]' : ''}`}>
                  {mine && <span className="absolute -top-3 left-6 rounded-full bg-[#f26522] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Your device</span>}
                  <div className="flex items-center justify-between">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-white/15 to-white/5 text-[#ffb347]">{item.icon}</span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">{installed ? 'Installed' : item.tag}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-bold">{item.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60">{item.line}</p>
                  {item.note && <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-white/55">{item.note}</p>}
                  <button type="button" onClick={() => void get(item.id, item.id)} disabled={busy === item.id} className={`mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold disabled:opacity-70 ${mine ? 'landing-cta text-white' : 'landing-ghost'}`}>
                    {installed ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                    {busy === item.id ? 'Opening…' : installed ? 'Open TCNP' : item.action}
                  </button>
                </article>
              )
            })}
          </div>

          {/* The web app: a fifth option that never goes away */}
          <article id="web-app" className="landing-card mt-5 flex flex-col gap-6 rounded-3xl p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-white/15 to-white/5 text-[#ffb347]"><Globe className="h-7 w-7" aria-hidden="true" /></span>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-bold">Web app</h3>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">{hasApp ? 'Installed on this device' : 'Works on every device'}</span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                  No store and nothing to download. Install TCNP straight from your browser and it opens like any other app, with its own icon, and keeps itself up to date. Or just open it and sign in.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => void installWeb()} disabled={busy === 'web'} className="landing-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-70">
                {hasApp ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                {busy === 'web' ? 'Opening…' : hasApp ? 'Open TCNP' : 'Install web app'}
              </button>
              <Link href="/login" className="landing-ghost inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold">
                Open in browser <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        </section>

        {/* ── What it does ─────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <div className="grid gap-5 lg:grid-cols-6">
            <Tile className="lg:col-span-4" icon={<MapPinned className="h-5 w-5" />} title="See every journey as it happens" body="Convoys, officers and call signs on one live map, from wheels-down to settled.">
              <MapStrip />
            </Tile>
            <Tile className="lg:col-span-2" icon={<BellRing className="h-5 w-5" />} title="Alerts that reach you" body="Assignments, call signs and emergencies arrive on your lock screen.">
              <div className="mt-6 space-y-2.5">
                {[['Broken Arrow', 'An officer has signalled distress.', 'bg-red-500'], ['New duty assignment', 'Open My Operations to acknowledge.', 'bg-[#f26522]'], ['Food is ready', 'Welfare has called mealtime.', 'bg-emerald-500']].map(([title, body, colour], index) => (
                  <div key={title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3" style={{ transform: `translateX(${index * 10}px)` }}>
                    <span className={`h-9 w-9 shrink-0 rounded-xl ${colour}`} />
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{title}</span><span className="block truncate text-xs text-white/55">{body}</span></span>
                  </div>
                ))}
              </div>
            </Tile>
            <Tile className="lg:col-span-2" icon={<Route className="h-5 w-5" />} title="One call sign at a time" body="Every Papa’s journey moves through clear checkpoints the whole team can read.">
              <ol className="mt-6 space-y-3">
                {[['First Course', true], ['Chapman', true], ['Dessert', false], ['Settled', false]].map(([label, done]) => (
                  <li key={label as string} className="flex items-center gap-3 text-sm font-medium">
                    <CheckCircle2 className={`h-5 w-5 ${done ? 'text-[#ffb347]' : 'text-white/20'}`} aria-hidden="true" />
                    <span className={done ? '' : 'text-white/45'}>{label}</span>
                  </li>
                ))}
              </ol>
            </Tile>
            <Tile className="lg:col-span-2" icon={<Users className="h-5 w-5" />} title="Every unit, one team" body="Alpha, Tango, Victor, November and the rest each get their own workspace, tasks and chat." >
              <div className="mt-6 flex flex-wrap gap-2">
                {UNITS.slice(1, 8).map(unit => <span key={unit} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/80">{unit}</span>)}
              </div>
            </Tile>
            <Tile className="lg:col-span-2" icon={<LockKeyhole className="h-5 w-5" />} title="Private by design" body="Your location is shared only while you switch it on, and only with your team.">
              <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <span><span className="block text-sm font-semibold">Share my location</span><span className="block text-xs text-white/55">You are in control</span></span>
                <span className="flex h-7 w-12 items-center rounded-full bg-emerald-500 p-1"><span className="ml-auto h-5 w-5 rounded-full bg-white shadow" /></span>
              </div>
            </Tile>
          </div>
        </section>

        {/* ── Closing call ─────────────────────────────────────── */}
        <section className="relative isolate mx-5 mb-16 overflow-hidden rounded-[2.5rem] border border-white/10 sm:mx-8 lg:mx-auto lg:max-w-7xl">
          <div className="absolute inset-0 -z-10">
            <Image src="/tcnp_cinematic_bg.png" alt="" fill sizes="100vw" className="object-cover object-[50%_70%] opacity-55 blur-[2px]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,12,0.55),rgba(5,7,12,0.92))]" />
          </div>
          <div className="px-6 py-16 text-center sm:py-20">
            <Radio className="mx-auto h-9 w-9 text-[#ffb347]" aria-hidden="true" />
            <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">On duty? Have it in your pocket.</h2>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#download" className="landing-cta inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full px-8 text-base font-bold text-white"><Download className="h-5 w-5" aria-hidden="true" />Get the app</a>
              <Link href="/login" className="landing-ghost inline-flex min-h-14 items-center justify-center rounded-full px-7 text-base font-semibold">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-white/50 sm:flex-row sm:px-8">
          <p className="flex items-center gap-3"><Image src="/icon-192.png" alt="" width={28} height={28} className="h-7 w-7" />© {new Date().getFullYear()} The Covenant Nation Protocol</p>
          <p className="flex items-center gap-5"><Link href="/login" className="hover:text-white">Sign in</Link><a href="#download" className="hover:text-white">Download</a><span>Version {version}</span></p>
        </div>
      </footer>

      {steps && <PWAInstallModal platform={steps} onClose={() => setSteps(null)} />}
    </div>
  )
}

function Tile({ icon, title, body, className = '', children }: { icon: ReactNode; title: string; body: string; className?: string; children: ReactNode }) {
  return (
    <article className={`landing-card overflow-hidden rounded-3xl p-7 ${className}`}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f26522]/15 text-[#ffb347]">{icon}</span>
      <h3 className="mt-5 text-2xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-white/60">{body}</p>
      {children}
    </article>
  )
}

/** A wide strip of live map for the tracking tile. */
function MapStrip() {
  const route = 'M-10 150 C 90 150, 120 60, 230 78 S 380 170, 470 110 S 620 40, 760 70'
  return (
    <div className="relative -mx-7 -mb-7 mt-7 h-56 overflow-hidden border-t border-white/10" aria-hidden="true">
      <svg viewBox="0 0 750 220" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <linearGradient id="ls-route" x1="0" x2="1"><stop offset="0" stopColor="#f26522" /><stop offset="1" stopColor="#ffb347" /></linearGradient>
          <radialGradient id="ls-glow"><stop offset="0" stopColor="#f26522" stopOpacity="0.55" /><stop offset="1" stopColor="#f26522" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="750" height="220" fill="#0d1524" />
        <g fill="#131d30">
          {[[10, 12, 120, 70], [150, -10, 110, 60], [280, 14, 150, 52], [450, -6, 120, 70], [590, 16, 170, 60], [-10, 100, 90, 130], [100, 118, 130, 110], [250, 100, 110, 60], [380, 130, 150, 100], [550, 100, 90, 130], [660, 112, 100, 120], [250, 176, 110, 60]].map(([x, y, w, h]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="8" />
          ))}
        </g>
        <path d={route} fill="none" stroke="#f26522" strokeOpacity="0.16" strokeWidth="12" strokeLinecap="round" />
        <path d={route} fill="none" stroke="url(#ls-route)" strokeWidth="3.5" strokeLinecap="round" className="landing-route" />
        {[[160, 44, '#2dd4bf'], [330, 150, '#60a5fa'], [520, 70, '#a78bfa'], [640, 150, '#2dd4bf'], [80, 190, '#60a5fa']].map(([cx, cy, colour]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="7" fill={colour as string} opacity="0.35" className="landing-ping" />
            <circle cx={cx} cy={cy} r="5" fill={colour as string} stroke="#0d1524" strokeWidth="2" />
          </g>
        ))}
        <g className="landing-travel" style={{ offsetPath: `path('${route}')`, offsetRotate: '0deg' }}>
          <circle r="20" fill="url(#ls-glow)" />
          <circle r="8" fill="#f26522" stroke="#fff" strokeWidth="3" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#0a0f18] to-transparent" />
    </div>
  )
}
