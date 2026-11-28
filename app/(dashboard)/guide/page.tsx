'use client'

import { Suspense, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpen, Search, MapPin, MessageCircle, Shield, Bell, ChevronRight,
  BarChart2, Navigation, Smartphone, HelpCircle, Home, Users,
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
        body: '• **Papa** — The principal being protected\n• **Cheetah** — An assigned vehicle with a call sign\n• **Delta Oscar (DO)** — Duty Officer assigned to a journey\n• **Call Sign** — The live status code for a journey phase (e.g. Chapman means arrival at the Theatre gate)\n• **Broken Arrow** — A major incident declaration that triggers a system-wide alert',
      },
      {
        heading: 'Who Can Do What',
        body: '**Super Admin / Admin / Captain / Vice Captain** → full system access\n**Command (Head of Command, Head of Operations, Command)** → command-level decisions, and every unit page\n**Delta Oscar** → the journeys you are assigned to, and their call signs\n**Unit members** → your unit\'s pages, from your unit membership. A unit head or sub-lead runs the unit\n\nYour Oscar is a label that names your unit. Access comes from your role and your unit membership, not from the Oscar.',
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
        body: 'Call signs indicate the live phase of a journey:\n• **First Course** — Departure from Nest to Theatre\n• **Cocktail** — Principal in transit\n• **Blue Cocktail** — In transit, mild traffic\n• **Red Cocktail** — In transit, heavy traffic\n• **Re-order** — Route change\n• **Chapman** — Arrival at Theatre gate\n• **Dessert** — Departure from Theatre to Nest\n• **Broken Arrow** — 🚨 Distress call for a major incident while transporting the Principal — triggers a system-wide alert\n\nA journey starts as **Planned** and ends as **Completed** or **Cancelled**.',
      },
      {
        heading: 'Updating Call Signs',
        body: 'Duty Officers and admins can update call signs from the **Ops Monitor** page. Click the call sign badge on any active journey row, select the new status, and confirm. A chime sound plays on successful update.',
      },
      {
        heading: 'DO responsibility through completion',
        body: 'The DO remains with their Papa at the theatre, throughout the speaking engagement, and during the return escort. After Papa finishes speaking, record the return to the Nest or Eagle Square in **My Operations**. Complete duty only after personally confirming that Papa is settled at the Nest, or that Papa’s flight has taken off or landed. Theatre arrival is a checkpoint, not the end of the DO assignment.',
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
        body: 'Location sharing is **off** until you turn it on. Open **Profile** (or **Settings**) and switch on **Location sharing**. Your browser then asks for location permission: allow it.\n\nWhile sharing is on and the app is open, your position is sent as you move and you appear on the Live Tracking map. Turn the switch off at any time: tracking stops and your pin is hidden. The choice is saved on each device separately, so turn it on again on a new phone or browser.',
      },
      {
        heading: 'Who Sees the Map',
        body: 'The Live Tracking map is for admins and Command. Each officer shows as **Active** (updated in the last 2 minutes), **Stale** (2 to 10 minutes) or **Offline** (more than 10 minutes). Select an officer to see their role, last update and, where the device reports them, speed and battery.',
      },
      {
        heading: 'Filters',
        body: 'Use the sidebar filters to search by name, Oscar or role, pick a role, and show Active, Stale or Offline officers. Collapse the sidebar for a full-screen map.',
      },
      {
        heading: 'iPhone and iPad',
        body: 'Location sharing works on iPhone and iPad (iOS 16 and later). Safari asks for permission when you turn sharing on. If you said no before, allow location for this site in **Settings → Safari → Location** (choose "While Using the App" or "Ask"), then turn sharing on again.',
      },
    ],
  },
  {
    id: 'chat',
    icon: MessageCircle,
    color: 'text-primary',
    bg: 'bg-primary/10',
    title: 'Chat',
    badge: 'Communications',
    content: [
      {
        heading: 'Choosing a Room',
        body: 'At the top of the Chat page, choose **Programs** or **Teams**.\n• **Programs** — pick the program, then the room under **Room**: **Program chat** (active officers assigned to the program join automatically) or a **Papa room** (each needs its own invitation)\n• **Teams** — your team\'s room\n\nExecutives and admins can open every room. Archived programs are not available. The room you pick stays in the address, so a refresh or a shared link opens the same room.',
      },
      {
        heading: 'Mentions',
        body: '• Type **@Name** to mention someone — they receive a notification\n• Type **@@Name** to send a **restricted message** — only the mentioned members, executives and admins can read it. Choose each @@ recipient from the suggestions before sending\n• Editing a message keeps its original audience; send a new message to change who can read it',
      },
      {
        heading: 'Search Messages',
        body: 'Use the search box above the messages to filter by keyword. It searches only the messages loaded so far: if nothing matches, load earlier messages to search further back. Clear the search to see all messages again.',
      },
      {
        heading: 'Load Earlier Messages',
        body: 'The chat loads the most recent 50 messages. Tap **Load earlier messages** at the top of the list to load the previous 50. Repeat to go further back.',
      },
      {
        heading: 'Message Actions',
        body: '• On a phone, **tap a message** to show its actions; on a computer, hover over it\n• **Reply** — answer a specific message\n• **Edit** — you can edit your own messages within 3 minutes of sending\n• **Delete** — removes the message from view\n• **React** — add an emoji reaction\n• **Read receipts** — a double tick shows the message has been seen',
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
    id: 'units',
    icon: Users,
    color: 'text-primary',
    bg: 'bg-primary/10',
    title: 'Unit Pages',
    badge: 'Units',
    content: [
      {
        heading: 'Which unit pages you see',
        body: 'You see the pages of the units you are a member of. Admins and Command see every unit. Your unit head (or an admin) adds you to a unit; ask them if a page you need is missing.',
      },
      {
        heading: 'Tasks tab',
        body: 'Every unit page has a **Tasks** tab. The unit head or a sub-lead adds tasks for a programme, gives each one an owner and a deadline, and edits them. If a task is yours, mark it in progress or done. You get a notification when a task is given to you and a reminder before it is due. All your tasks across units also appear in **My Operations**.',
      },
      {
        heading: 'Programme team tab',
        body: 'The **Programme team** tab lists the unit\'s members for the chosen programme and shows who is working on it. To do programme work in a unit, you must be active on the programme. The head and sub-leads work by right; other members need the head (or Command) to add them to the team.',
      },
    ],
  },
  {
    id: 'den',
    icon: Home,
    color: 'text-primary',
    bg: 'bg-primary/10',
    title: 'November (Den)',
    badge: 'Unit',
    content: [
      {
        heading: 'Choose the programme first',
        body: 'Open **November (Den)** and pick the programme in the **Programme** box beside the title. The plan, tasks, roster and reports then show that programme.',
      },
      {
        heading: 'Tasks & Checklists',
        body: 'Your Den tasks and shifts also appear under **My Den work** on the Dashboard. Mark a task done there or on the **Tasks & Checklists** tab.',
      },
      {
        heading: 'Roster check-in',
        body: 'On the **Roster** tab (or the Dashboard), check in from two hours before your shift until it ends, and check out when you leave.',
      },
      {
        heading: 'Reports',
        body: 'Write field reports on the **Reports** tab. After the programme, the post-operation report is submitted and filed in the repository so the next team can learn from it.',
      },
    ],
  },
  {
    id: 'pwa',
    icon: Smartphone,
    color: 'text-primary',
    bg: 'bg-primary/10',
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
        heading: 'Access by Role and Unit',
        body: 'Admin and Command access comes from your role. Unit pages follow your unit membership: a member works in their own unit, and the head and sub-leads run it. Admins and Command keep full access to every unit. If you do not have permission for a feature, it is hidden rather than showing an error page. The database checks every read and write as well.',
      },
      {
        heading: 'Sign-up Approvals',
        body: 'New sign-ups wait on **Approvals**. An admin decides any sign-up; a unit head decides sign-ups for their own unit. To decline, give a short reason. A declined person sees a message when they try to sign in, and admins and Command can reopen a declined sign-up from the list of the last 30 days.',
      },
      {
        heading: 'Passports Are Private',
        body: 'A Papa\'s passport details are kept apart from the rest of the Papa record. Only admins, Command and the Alpha head or sub-leads, who handle immigration, can see or edit them. Other officers, Delta Oscars and Alpha members never see a passport.',
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

const TOPIC_IDS = sections.map((section) => section.id)

function GuideContent() {
  const params = useSearchParams()
  const [search, setSearch] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  // The open topic lives in ?topic=, so a refresh or a shared link lands on it.
  const requestedTopic = params.get('topic')
  const active = requestedTopic && TOPIC_IDS.includes(requestedTopic) ? requestedTopic : 'overview'

  const query = search.trim().toLowerCase()
  const matches = (text: string) => text.toLowerCase().includes(query)
  const filtered = sections.filter(
    (s) => query === '' || matches(s.title) || s.content.some((c) => matches(c.heading) || matches(c.body))
  )
  const results = query
    ? filtered.flatMap((s) =>
        s.content
          .filter((c) => matches(c.heading) || matches(c.body) || matches(s.title))
          .map((c) => ({ ...c, topic: s.title, key: `${s.id}:${c.heading}` }))
      )
    : []

  const activeSection = sections.find((s) => s.id === active) ?? sections[0]

  const selectTopic = (id: string) => {
    setSearch('')
    const url = new URL(window.location.href)
    if (id === 'overview') url.searchParams.delete('topic')
    else url.searchParams.set('topic', id)
    window.history.replaceState(null, '', url)
    // On a phone the topic list sits below the content: bring the newly
    // opened topic into view instead of leaving the reader at the bottom.
    const content = contentRef.current
    if (content && content.getBoundingClientRect().top < 0) content.scrollIntoView({ block: 'start' })
  }

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

  const ActiveIcon = activeSection.icon

  return (
    <div className="space-y-5 page-enter">
      <PageHeader
        icon={BookOpen}
        title="Guide"
        description="How TCNP works, topic by topic."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search the guide..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 text-base sm:text-sm"
              aria-label="Search the guide"
            />
          </div>
        }
      />

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* Topic list (tablet and up); phones get the grid under the content */}
        <aside className="hidden w-64 shrink-0 flex-col gap-3 md:sticky md:top-0 md:flex">
          <nav aria-label="Guide topics" className="space-y-0.5">
            {filtered.map((section) => {
              const Icon = section.icon
              const isActive = !query && active === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => selectTopic(section.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className={`flex-shrink-0 rounded-md p-1.5 ${section.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${section.color}`} aria-hidden="true" />
                  </div>
                  <span className="flex-1 truncate">{section.title}</span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </nav>

          {/* Help footer */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-2 mb-1">
              <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-medium">Need help?</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Contact your system administrator or Super Admin for account issues.
            </p>
          </div>
        </aside>

        {/* Content area */}
        <div ref={contentRef} className="min-w-0 flex-1 scroll-mt-4">
          {/* Phones: change topic from the top. The full list sits under the
              article, a long scroll away on a phone. */}
          <nav aria-label="Guide topics" className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            {sections.map((section) => {
              const isActive = !query && active === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => selectTopic(section.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors active:bg-muted ${isActive ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  {section.title}
                </button>
              )
            })}
          </nav>
          {query && results.length === 0 ? (
            <EmptyState
              icon={Search}
              title={<>No results for &ldquo;{search.trim()}&rdquo;</>}
              description="Try a different word, or browse the topics."
              action={<Button variant="outline" size="sm" className="h-9" onClick={() => setSearch('')}>Clear search</Button>}
            />
          ) : (
            <div className="max-w-3xl space-y-6 pb-4">
              {/* Section heading */}
              <div>
                <div className="flex items-center gap-3">
                  {query ? (
                    <div className="rounded-xl bg-muted p-2.5">
                      <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    </div>
                  ) : (
                    <div className={`rounded-xl p-2.5 ${activeSection.bg}`}>
                      <ActiveIcon className={`h-5 w-5 ${activeSection.color}`} aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{query ? 'Search results' : activeSection.title}</h2>
                    <Badge variant="secondary" className="text-xs">
                      {query ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : activeSection.badge}
                    </Badge>
                  </div>
                </div>
                <div className="h-px bg-border mt-4" />
              </div>

              {/* Section content */}
              {(query ? results : activeSection.content.map((c) => ({ ...c, topic: null as string | null, key: c.heading }))).map((item) => (
                <Card key={item.key} className="border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    {item.topic && <p className="text-xs font-medium text-muted-foreground">{item.topic}</p>}
                    <CardTitle className="text-base font-semibold">{item.heading}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1">
                    {renderBody(item.body)}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Phones: every topic, under the content */}
          <nav aria-label="All guide topics" className="mt-6 border-t pt-4 md:hidden">
            <p className="text-xs text-muted-foreground font-medium mb-3">All Topics</p>
            <div className="grid grid-cols-2 gap-2">
              {sections.map((section) => {
                const Icon = section.icon
                const isActive = !query && active === section.id
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => selectTopic(section.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                      isActive ? 'border-primary/40 bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <div className={`shrink-0 rounded-md p-1 ${section.bg}`}>
                      <Icon className={`h-3 w-3 ${section.color}`} aria-hidden="true" />
                    </div>
                    <span className="truncate text-xs font-medium">{section.title}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  )
}

export default function GuidePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" aria-label="Loading the guide" />}>
      <GuideContent />
    </Suspense>
  )
}
