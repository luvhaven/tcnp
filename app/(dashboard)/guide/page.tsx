'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  BookOpen, Search, MapPin, MessageCircle, Shield, Car, Users,
  Bell, Radio, Zap, ChevronRight, Clock, AlertTriangle, Lock, AtSign,
  BarChart2, Navigation, Smartphone, Settings, HelpCircle
} from 'lucide-react'

const sections = [
  {
    id: 'overview',
    icon: BookOpen,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    title: 'Platform Overview',
    badge: 'Start Here',
    content: [
      {
        heading: 'What is TCNP?',
        body: 'The Covenant Nation Protocol (TCNP) is an enterprise journey management system for coordinating protective operations. It tracks Papas (principals), Cheetahs (vehicles), Duty Officers, and all active journeys in real time.',
      },
      {
        heading: 'Core Concepts',
        body: '• **Papa** — The principal being protected\n• **Cheetah** — An assigned vehicle with a call sign\n• **Delta Oscar (DO)** — Duty Officer assigned to a journey\n• **Call Sign** — The live status code for a journey phase (e.g. HOTEL means stationary at destination)\n• **Broken Arrow** — A major incident declaration that triggers a system-wide alert',
      },
      {
        heading: 'Role Hierarchy',
        body: '**Super Admin / Dev Admin** → full system access\n**Admin** → all ops management\n**Head of Command / Captain** → command-level decisions\n**Delta Oscar** → journey management & call sign updates\n**Tango / Alpha / Victor Oscars** → assigned support roles\n**Viewer** → read-only access to dashboards',
      },
    ],
  },
  {
    id: 'journeys',
    icon: Navigation,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    title: 'Journey Management',
    badge: 'Core Feature',
    content: [
      {
        heading: 'Creating a Journey',
        body: '1. Navigate to **Journeys** in the sidebar\n2. Click **Create New Journey**\n3. Select the Papa (principal) for this journey\n4. Assign a Cheetah (vehicle) and Delta Oscar\n5. Set the origin nest and destination\n6. Set ETA / ETD using the **Set Times** button in the Ops Monitor\n7. Click **Create Journey** to activate',
      },
      {
        heading: 'Call Signs',
        body: 'Call signs indicate the live phase of a journey:\n• **ALPHA** — Departure initiated\n• **BRAVO** — En route\n• **CHARLIE** — Approaching destination\n• **DELTA** — Arrived at waypoint\n• **ECHO** — Stationary (planned stop)\n• **FOXTROT** — Returning\n• **GOLF** — En route back\n• **HOTEL** — Arrived at final destination\n• **BROKEN ARROW** — 🚨 Major incident — triggers system-wide alert',
      },
      {
        heading: 'Updating Call Signs',
        body: 'Duty Officers and admins can update call signs from the **Ops Monitor** page. Click the call sign badge on any active journey row, select the new status, and confirm. A chime sound plays on successful update.',
      },
      {
        heading: 'Setting ETA / ETD',
        body: 'In the Ops Monitor, click the **Set Times** or **Edit Times** button on any journey row. A dialog appears with datetime pickers for both ETA (Estimated Arrival) and ETD (Estimated Departure). Only admins and assigned DOs can edit times.',
      },
    ],
  },
  {
    id: 'ops-monitor',
    icon: BarChart2,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    title: 'Operations Monitor',
    badge: 'Key Screen',
    content: [
      {
        heading: 'What You See',
        body: 'The Ops Monitor shows all active (non-completed, non-cancelled) journeys in real time. Each row shows: Papa name, vehicle call sign, assigned DO, current call sign status, and action buttons.',
      },
      {
        heading: 'Real-Time Updates',
        body: 'The table subscribes to Supabase Realtime. When any journey is updated by any user, the row flashes and updates automatically — no page refresh needed.',
      },
      {
        heading: 'Broken Arrow Response',
        body: 'If any journey transitions to **Broken Arrow** status, a full-screen red alert immediately appears on ALL active sessions. The alert plays an alarm sound and vibrates mobile devices. Tap **Acknowledge & Dismiss** once you have taken action.',
      },
      {
        heading: 'Access Control',
        body: 'Only Delta Oscars assigned to a specific journey, and admins/captains, can update call signs. Super Admin and Dev Admin have unrestricted access to all journey operations.',
      },
    ],
  },
  {
    id: 'live-tracking',
    icon: MapPin,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    title: 'Live Tracking',
    badge: 'GPS',
    content: [
      {
        heading: 'Location Sharing',
        body: 'When you sign in, the platform automatically requests location permission. Granting it makes you visible on the Live Tracking map. Your location updates every 10 seconds while you are active. A green banner appears at the bottom of the screen when sharing is active.',
      },
      {
        heading: 'Map Features',
        body: '• **Blue markers** — Active officers (updated < 2 min ago)\n• **Pulsing red dots** — Stale locations (> 5 min since update)\n• **Dashed coloured lines** — Route trails showing recent movement path of each officer\n• **Popup on click** — Shows full name, OSCAR, role, battery %, speed, and last update time',
      },
      {
        heading: 'Filters',
        body: 'Use the sidebar filters to narrow by: name/OSCAR/role search, role category (DO, AO, TO, VO), and status (Active / Stale / Offline). The sidebar can be collapsed for a full-screen map view.',
      },
      {
        heading: 'iOS Devices',
        body: 'Location tracking now works on iPhone and iPad (iOS 16+). Safari will prompt for permission on first load. Ensure "Allow location access: While using the app" is selected in Safari settings.',
      },
      {
        heading: 'Battery & Speed',
        body: 'The app reads device battery level (Android/Desktop only) and calculated speed from GPS delta. Battery below 20% shows in red in the map popup and triggers a system notification to admins.',
      },
    ],
  },
  {
    id: 'chat',
    icon: MessageCircle,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    title: 'Team Chat',
    badge: 'Communications',
    content: [
      {
        heading: 'Chat Channels',
        body: 'Chat is organised by context:\n• **Global** — visible to all users\n• **Program chat** — only users assigned to that program\n• **Papa-specific** — tied to a specific Papa\'s journey context\n\nUse the tabs at the top of the Chat page to switch between channels.',
      },
      {
        heading: 'Mentions',
        body: '• Type **@FirstName** to publicly mention someone — they receive a notification\n• Type **@@FirstName** to send a **private message** — only the sender, recipient, and admins can see it\n• A suggestion dropdown appears as you type — select from the list or keep typing to filter',
      },
      {
        heading: 'Search Messages',
        body: 'Use the search bar in the chat header to filter messages by keyword. Matching text is shown inline. Clear the search bar to see all messages again.',
      },
      {
        heading: 'Load Earlier Messages',
        body: 'The chat loads the most recent 50 messages by default. Click **Load earlier messages** at the top of the list to load the previous 50. This can be repeated to scroll back through the full history.',
      },
      {
        heading: 'Message Actions',
        body: '• **Reply** — hover a message and click the reply icon to thread a response\n• **Edit** — you can edit your own messages within 3 minutes of sending\n• **Delete** — soft-delete removes the message from view\n• **Read receipts** — message turns blue when the recipient has seen it',
      },
      {
        heading: 'Presence & Typing',
        body: 'Green dot indicators show who is currently online. When someone is typing, an animated "..." indicator appears at the bottom of the chat.',
      },
    ],
  },
  {
    id: 'notifications',
    icon: Bell,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    title: 'Notifications',
    badge: 'Alerts',
    content: [
      {
        heading: 'Notification Types',
        body: '• **Info** — general updates and system messages\n• **Alert** — journey status changes, location loss\n• **Broken Arrow** — 🚨 emergency — shown in the Emergency filter tab with red highlight',
      },
      {
        heading: 'Notification Bell',
        body: 'Click the bell icon in the top-right header to open the notification panel. Unread count is shown as an orange badge. Use the tabs to filter by All / Unread / Emergency.',
      },
      {
        heading: 'Mark as Read',
        body: 'Click **Mark all read** in the panel header to clear all unread badges at once. Individual notifications can be dismissed with the × button.',
      },
    ],
  },
  {
    id: 'echo',
    icon: Radio,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    title: 'Equipment (Echo)',
    badge: 'Inventory',
    content: [
      {
        heading: 'Purpose',
        body: 'The Echo page manages all operational equipment — radios, trackers, vests, and other field gear. Each item is categorised and can be assigned to personnel.',
      },
      {
        heading: 'Adding Equipment',
        body: 'Admin roles can add new equipment items via the **Add Equipment** button. Fill in the name, category, serial number, and assigned user. Equipment status (available/in use/maintenance) is tracked in real time.',
      },
    ],
  },
  {
    id: 'pwa',
    icon: Smartphone,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
    title: 'Install as App (PWA)',
    badge: 'Mobile',
    content: [
      {
        heading: 'Android & Desktop',
        body: 'A banner appears at the bottom of the screen offering to install TCNP as a native app. Tap **Install** and confirm in the browser prompt. Once installed, the app launches in standalone mode without the browser chrome.',
      },
      {
        heading: 'iPhone / iPad (iOS)',
        body: '1. Open the site in **Safari** (must be Safari, not Chrome)\n2. Tap the **Share** button (rectangle with arrow)\n3. Scroll down and tap **Add to Home Screen**\n4. Tap **Add** to confirm\n\nThe app icon will appear on your home screen and launch in full-screen mode.',
      },
      {
        heading: 'Home Screen Shortcuts',
        body: 'Long-pressing the app icon on Android shows quick-access shortcuts to: **Dashboard**, **Journeys**, **Ops Monitor**, and **Chat** — no navigation required.',
      },
    ],
  },
  {
    id: 'security',
    icon: Shield,
    color: 'text-gray-500',
    bg: 'bg-gray-500/10',
    title: 'Security & Access',
    badge: 'Admin',
    content: [
      {
        heading: 'Role-Based Access',
        body: 'Every page and action enforces role-based access control. If you do not have permission for a feature, it is silently hidden rather than showing an error page.',
      },
      {
        heading: 'Audit Logs',
        body: 'Admin and Super Admin roles can access the **Audit Logs** page to review all significant actions: journey creation/updates, call sign changes, user management, and equipment assignments.',
      },
      {
        heading: 'Session Security',
        body: 'Sessions are managed by Supabase Auth with JWT tokens. Signing out immediately invalidates the session. All API calls are authenticated and authorised server-side via Row Level Security policies.',
      },
    ],
  },
]

export default function GuidePage() {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState('overview')

  const filtered = sections.filter(
    (s) =>
      search === '' ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.some(
        (c) =>
          c.heading.toLowerCase().includes(search.toLowerCase()) ||
          c.body.toLowerCase().includes(search.toLowerCase())
      )
  )

  const activeSection = sections.find((s) => s.id === active) ?? sections[0]

  const renderBody = (body: string) => {
    return body.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g)
      return (
        <p key={i} className={`text-sm text-muted-foreground leading-relaxed ${i > 0 ? 'mt-1.5' : ''}`}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j} className="font-semibold text-foreground">
                {part}
              </strong>
            ) : (
              part
            )
          )}
        </p>
      )
    })
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4 overflow-hidden page-enter">
      {/* Left nav */}
      <aside className="hidden w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto md:flex">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guide..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
            aria-label="Search guide"
          />
        </div>

        {/* Nav items */}
        <nav className="space-y-0.5">
          {filtered.map((section) => {
            const Icon = section.icon
            const isActive = active === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActive(section.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className={`flex-shrink-0 rounded-md p-1.5 ${section.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${section.color}`} />
                </div>
                <span className="flex-1 truncate">{section.title}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
              </button>
            )
          })}
        </nav>

        {/* Help footer */}
        <div className="mt-auto rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Need help?</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Contact your system administrator or Super Admin for account issues.
          </p>
        </div>
      </aside>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-muted-foreground">No results for &ldquo;{search}&rdquo;</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search term</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl space-y-8 pb-12">
            {/* Page header */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={`rounded-xl p-2.5 ${activeSection.bg}`}>
                  {(() => {
                    const Icon = activeSection.icon
                    return <Icon className={`h-5 w-5 ${activeSection.color}`} />
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold">{activeSection.title}</h1>
                    <Badge variant="secondary" className="text-[10px]">
                      {activeSection.badge}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="h-px bg-border mt-4" />
            </div>

            {/* Section content */}
            {(search
              ? filtered.flatMap((s) => s.content.filter(
                  (c) =>
                    c.heading.toLowerCase().includes(search.toLowerCase()) ||
                    c.body.toLowerCase().includes(search.toLowerCase())
                ))
              : activeSection.content
            ).map((item, i) => (
              <Card key={i} className="border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">{item.heading}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-1">
                  {renderBody(item.body)}
                </CardContent>
              </Card>
            ))}

            {/* Mobile: show all sections inline */}
            <div className="md:hidden pt-4 border-t">
              <p className="text-xs text-muted-foreground font-medium mb-3">All Topics</p>
              <div className="grid grid-cols-2 gap-2">
                {sections.map((section) => {
                  const Icon = section.icon
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActive(section.id)}
                      className="flex items-center gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted transition-colors"
                    >
                      <div className={`rounded-md p-1 ${section.bg}`}>
                        <Icon className={`h-3 w-3 ${section.color}`} />
                      </div>
                      <span className="truncate text-xs font-medium">{section.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
