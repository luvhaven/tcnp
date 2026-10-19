"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import packageInfo from '@/package.json'
import { filterNavigation } from '@/lib/navigation-search'
import { Input } from '@/components/ui/input'
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount'
import { useUnreadAssignments } from '@/hooks/useUnreadAssignments'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  ChevronLeft,
  Search,
  X,
} from "lucide-react"
import { NAV_SECTIONS, getVisibleNav } from "@/components/layout/nav-config"

/** Stable DOM id for a nav section, so its heading and list can be linked. */
function sectionId(label: string) {
  return label.replace(/\s+/g, "-").toLowerCase()
}

type SidebarProps = {
  isMobile?: boolean
  onClose?: () => void
}

// ─── Singleton client ───
const supabase = createClient()

export function Sidebar({ isMobile = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })
  const [searchState, setSearchState] = useState({ pathname, value: '' })
  const search = searchState.pathname === pathname ? searchState.value : ''
  const setSearch = (value: string) => setSearchState({ pathname, value })
  const searchInput = useRef<HTMLInputElement>(null)
  const setCollapsed = (value: boolean) => {
    setCollapsedState(value)
    try { window.localStorage.setItem('sidebar-collapsed', String(value)) } catch (_) { }
  }
  const { count: unreadChat } = useUnreadChatCount()
  const { count: unreadAssignments } = useUnreadAssignments()
  const { data: currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser()
  const [unitSlugs, setUnitSlugs] = useState<string[]>([])

  useEffect(() => {
    const loadMemberships = async () => {
      if (!currentUser?.id) {
        if (!isLoadingCurrentUser) setUnitSlugs([])
        return
      }

      try {
        const { data: memberships, error } = await (supabase as any)
          .from('unit_memberships')
          .select('units!inner(slug)')
          .eq('user_id', currentUser.id)
          .eq('status', 'active')
        if (error) throw error
        setUnitSlugs((memberships || []).map((row: any) => row.units?.slug).filter(Boolean))
      } catch (err) {
        console.warn('Sidebar membership load failed:', err)
        setUnitSlugs([])
      }
    }
    void loadMemberships()
  }, [currentUser?.id, isLoadingCurrentUser])

  const visibleSections = useMemo(() => {
    const allowed = new Set(getVisibleNav(currentUser?.role ?? null, currentUser?.oscar ?? null, unitSlugs).map(i => i.href))
    return NAV_SECTIONS
      .map(section => ({ ...section, items: section.items.filter(i => allowed.has(i.href)) }))
      .filter(section => section.items.length > 0)
  }, [currentUser?.role, currentUser?.oscar, unitSlugs])
  const filteredSections = filterNavigation(visibleSections, collapsed && !isMobile ? '' : search)
  const resultCount = filteredSections.reduce((count, section) => count + section.items.length, 0)

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-border/60 bg-gradient-to-b from-background via-card/95 to-background/95 shadow-xl backdrop-blur-sm transition-[width] duration-slow ease-out",
        isMobile ? "w-64" : collapsed ? "w-[76px]" : "w-[248px]"
      )}
    >
      {/* Desktop collapse toggle — aligned with Dashboard nav item */}
      {!isMobile && (
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="hit-area absolute -right-3 top-[5.75rem] z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 nav:flex"
        >
          <ChevronLeft
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-slow ease-out",
              collapsed && "rotate-180"
            )}
          />
        </button>
      )}

      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        <Link
          href="/dashboard"
          className="flex items-center justify-start gap-2 overflow-hidden"
          onClick={isMobile ? onClose : undefined}
        >
          <div className="relative h-8 w-8 flex-shrink-0">
            <Image src="/tcnp_logo.png" alt="The Covenant Nation" fill sizes="32px" className="object-contain" priority />
          </div>
          <div className={cn(
            "flex flex-col transition-[width,opacity] duration-slow ease-out overflow-hidden whitespace-nowrap",
            collapsed && !isMobile ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            <span className="text-sm font-semibold truncate leading-tight">TCN Protocol</span>
            <span className="text-xs text-muted-foreground truncate leading-tight">Central Application</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      {(!collapsed || isMobile) && <div className="px-3 pt-4 pb-2">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input ref={searchInput} type="search" aria-label="Find a page" placeholder="Find a page…" value={search}
            onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && search) { event.stopPropagation(); setSearch('') } }}
            className="pl-9 pr-10 bg-muted/40 shadow-none [&::-webkit-search-cancel-button]:appearance-none" />
          {search && <button type="button" aria-label="Clear page search" onClick={() => { setSearch(''); searchInput.current?.focus() }} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="h-4 w-4" /></button>}
        </div>
        {search.trim() && <p role="status" className="px-1 pt-2 text-xs text-muted-foreground">{resultCount} {resultCount === 1 ? 'page' : 'pages'} found</p>}
      </div>}
      <nav aria-label="Main navigation" className="sidebar-scroll flex-1 overflow-y-auto p-2">
        {filteredSections.length === 0 && <div className="px-3 py-6 text-sm leading-6"><p className="font-medium">No matching pages</p><p className="mt-1 text-muted-foreground">Try a page or unit name, such as Training.</p><button type="button" className="mt-3 rounded text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSearch(''); searchInput.current?.focus() }}>Show all available pages</button></div>}
        {filteredSections.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-3")}>
            {/* A rule stands in for the label when collapsed, but the heading
                itself stays in the accessibility tree so the group keeps its
                name. 10px at muted-foreground/70 measured 2.72:1, under AA;
                text-overline is 11px at full muted-foreground, which clears it. */}
            {collapsed && !isMobile && sectionIndex > 0 && (
              <div className="mx-3 mb-2 border-t border-border/60" aria-hidden="true" />
            )}
            <h2
              id={`nav-section-${sectionId(section.label)}`}
              className={cn(
                "select-none",
                collapsed && !isMobile
                  ? "sr-only"
                  : "px-3 pb-1 pt-2 text-overline uppercase text-muted-foreground"
              )}
            >
              {section.label}
            </h2>
            <ul aria-labelledby={`nav-section-${sectionId(section.label)}`} className="space-y-1">
              {section.items.map((item, index) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                const isChat = item.name === "Team Chat"
                const isOps = item.name === "My Operations"
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={collapsed && !isMobile ? item.name : undefined}
                      onClick={isMobile ? onClose : undefined}
                      className={cn(
                        "relative flex min-h-11 items-center justify-start px-3 py-2 text-sm font-medium rounded-r-lg rounded-l-none gap-3 mr-1 transition-colors duration-150 border-l-[3px] border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                      title={collapsed && !isMobile ? item.name : undefined}
                    >
                      {/* Active pill glides between items via shared layout animation */}
                      {isActive && (
                        <motion.span
                          layoutId={isMobile ? "sidebar-active-mobile" : "sidebar-active"}
                          className="absolute inset-0 -left-[3px] rounded-r-lg border-l-[3px] border-primary bg-primary/10 shadow-sm"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                          aria-hidden
                        />
                      )}
                      <div className="relative z-10 flex-shrink-0">
                        <item.icon className="h-5 w-5" />
                        {/* Collapsed badge dots */}
                        {isChat && unreadChat > 0 && collapsed && !isMobile && (
                          <>
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden="true" />
                            <span className="sr-only">{unreadChat} unread</span>
                          </>
                        )}
                        {isOps && unreadAssignments > 0 && collapsed && !isMobile && (
                          <>
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-info motion-safe:animate-pulse" aria-hidden="true" />
                            <span className="sr-only">{unreadAssignments} unread</span>
                          </>
                        )}
                      </div>
                      <span className={cn(
                        "relative z-10 flex items-center justify-between w-full transition-[width,opacity] duration-slow ease-out overflow-hidden whitespace-nowrap",
                        collapsed && !isMobile ? "w-0 opacity-0" : "w-auto opacity-100"
                      )}>
                        <span>{item.name}</span>
                        <span className="flex gap-1 ml-auto">
                          {isChat && unreadChat > 0 && !(collapsed && !isMobile) && (
                            <Badge variant="destructive" className="font-semibold shadow-elevation">
                              {unreadChat > 99 ? '99+' : unreadChat}
                            </Badge>
                          )}
                          {isOps && unreadAssignments > 0 && !(collapsed && !isMobile) && (
                            <Badge className="bg-primary-text font-semibold text-white shadow-elevation">
                              {unreadAssignments > 9 ? '9+' : unreadAssignments}
                            </Badge>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!(collapsed && !isMobile) && (
        <div className="mt-auto border-t border-border/50 bg-background/50 p-4 backdrop-blur-sm">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Version {packageInfo.version}</span>
            <span>&copy; {new Date().getFullYear()} TCNP</span>
          </div>
        </div>
      )}
    </div>
  )
}
