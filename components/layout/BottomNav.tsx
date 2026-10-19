"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useUnreadChatCount } from "@/hooks/useUnreadChatCount"
import { useUnreadAssignments } from "@/hooks/useUnreadAssignments"
import { ALL_NAV, getVisibleNav } from "@/components/layout/nav-config"

/** The destinations worth a thumb-reach slot, in tab order. Everything else lives under "More". */
const TAB_HREFS = ["/dashboard", "/my-operations", "/chat", "/incidents"] as const

const SHORT_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/my-operations": "My Ops",
  "/chat": "Chat",
  "/incidents": "Incidents",
}

type BottomNavProps = {
  /** Opens the existing sidebar drawer. */
  onOpenMore: () => void
  moreOpen: boolean
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Phone-only tab bar (hidden from the `nav` breakpoint up, where the sidebar
 * is always visible). Tabs are filtered with the sidebar's own getVisibleNav,
 * so a role never sees a tab here that its sidebar hides.
 *
 * Its height is `--bottom-nav-h` (globals.css), which main's bottom padding
 * and the FloatingStack offset both read, so nothing hides behind it.
 */
export function BottomNav({ onOpenMore, moreOpen }: BottomNavProps) {
  const pathname = usePathname() ?? ""
  const { data: currentUser } = useCurrentUser()
  const { count: unreadChat } = useUnreadChatCount()
  const { count: unreadAssignments } = useUnreadAssignments()

  const tabs = useMemo(() => {
    const allowed = new Set(
      getVisibleNav(currentUser?.role ?? null, currentUser?.oscar ?? null).map((item) => item.href)
    )
    return TAB_HREFS.filter((href) => allowed.has(href))
      .map((href) => ALL_NAV.find((item) => item.href === href))
      .filter((item): item is (typeof ALL_NAV)[number] => Boolean(item))
  }, [currentUser?.role, currentUser?.oscar])

  const badgeFor = (href: string) => {
    if (href === "/chat" && unreadChat > 0) return unreadChat > 99 ? "99+" : String(unreadChat)
    if (href === "/my-operations" && unreadAssignments > 0) return unreadAssignments > 9 ? "9+" : String(unreadAssignments)
    return null
  }

  return (
    <nav
      aria-label="Primary"
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md nav:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
        {tabs.map(({ href, name, icon: Icon }) => {
          const active = isActive(pathname, href)
          const badge = badgeFor(href)
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${name}, ${badge} unread` : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {badge && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2.5 -top-1.5 min-w-[1.125rem] rounded-full bg-destructive px-1 text-center text-[11px] font-semibold leading-[1.125rem] text-destructive-foreground"
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span>{SHORT_LABELS[href] ?? name}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={onOpenMore}
            aria-expanded={moreOpen}
            aria-controls="app-sidebar-drawer"
            // `relative` keeps globals.css's `nav button::after` hit-area
            // pseudo-element on this button instead of spanning the whole bar.
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              moreOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
