'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const destinations = [
  ['/my-operations', 'My assignments'],
  ['/incidents', 'Report an incident'],
  ['/outbox', 'Pending submissions'],
] as const

export function WorkNavigation() {
  const pathname = usePathname()
  return <nav aria-label="Daily work" className="mb-4 flex flex-wrap gap-2 border-b pb-3">
    {destinations.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${pathname === href ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>{label}</Link>)}
  </nav>
}
