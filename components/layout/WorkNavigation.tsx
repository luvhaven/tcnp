'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, CircleAlert, Inbox } from 'lucide-react'

const destinations = [
  ['/my-operations', 'My assignments', ClipboardList],
  ['/incidents', 'Incidents', CircleAlert],
  ['/outbox', 'Submission outbox', Inbox],
] as const

export function WorkNavigation() {
  const pathname = usePathname()
  return <nav aria-label="Daily work" className="mb-6 flex gap-1 overflow-x-auto border-b pb-3">
    {destinations.map(([href, label, Icon]) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${pathname === href || pathname.startsWith(`${href}/`) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon aria-hidden="true" className="h-4 w-4" />{label}</Link>)}
  </nav>
}
