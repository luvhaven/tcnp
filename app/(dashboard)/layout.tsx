'use client'

import { useState, Suspense, useEffect } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion } from "framer-motion"
import { useIsClient } from "@/hooks/useIsClient"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { PresenceHeartbeat } from "@/components/utils/PresenceHeartbeat"
import { BrokenArrowAlert } from "@/components/operations/BrokenArrowAlert"
import { createClient } from "@/lib/supabase/client"

// ─── Singleton client — always the same instance, safe to use in effects ───
const supabase = createClient()

import { useChatNotifications } from "@/hooks/useChatNotifications"

// Core layout components - loaded normally but wrapped in error boundaries
import { Header } from "@/components/layout/header"

// Dynamically import ALL potentially problematic components with SSR disabled
const Sidebar = dynamic(
  () => import("@/components/layout/sidebar").then((m) => m.Sidebar),
  { ssr: false, loading: () => <div className="h-full w-[248px] bg-background animate-pulse" /> }
)

// These components are COMPLETELY DISABLED on iOS - they cause crashes
const LocationTracker = dynamic(
  () => import("@/components/tracking/LocationTracker").then((m) => m.LocationTracker),
  { ssr: false }
)

const LocationEnforcer = dynamic(
  () => import("@/components/tracking/LocationEnforcer").then((m) => m.LocationEnforcer),
  { ssr: false }
)

const NotificationPermissionBanner = dynamic(
  () => import("@/components/notifications/NotificationPermissionBanner"),
  { ssr: false }
)

const MissionNotificationHandler = dynamic(
  () => import("@/components/missions/MissionNotificationHandler"),
  { ssr: false }
)

const DevLoggerInit = dynamic(
  () => import("@/components/utils/DevLoggerInit").then((m) => m.DevLoggerInit),
  { ssr: false }
)

const OnlineStatusBanner = dynamic(
  () => import("@/components/ui/online-status-banner").then((m) => m.OnlineStatusBanner),
  { ssr: false }
)

const SyncStatusBadge = dynamic(
  () => import("@/components/ui/sync-status-badge").then((m) => m.SyncStatusBadge),
  { ssr: false }
)

const PWAInstallPrompt = dynamic(
  () => import("@/components/pwa/PWAInstallPrompt").then((m) => m.PWAInstallPrompt),
  { ssr: false }
)

const PasswordEnforcer = dynamic(
  () => import("@/components/security/PasswordEnforcer").then((m) => m.PasswordEnforcer),
  { ssr: false }
)

const ProfileCompletionEnforcer = dynamic(
  () => import("@/components/security/ProfileCompletionEnforcer").then((m) => m.ProfileCompletionEnforcer),
  { ssr: false }
)

/**
 * iOS-Safe Dashboard Layout - NUCLEAR OPTION
 * 
 * On iOS, we completely disable:
 * - Location tracking (crashes after mount)
 * - Notification banner (crashes in private mode)
 * - Sync status badge (uses IndexedDB which fails on iOS)
 * - Dev logger (not critical)
 * 
 * These features work on desktop/Android but CRASH iOS Safari.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const isClient = useIsClient()
  const [isIOS, setIsIOS] = useState(false)
  const [canMountExtras, setCanMountExtras] = useState(false)
  const [canMountTracker, setCanMountTracker] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Mount global chat notification listener (supabase singleton defined at module level)
  useChatNotifications(currentUserId)

  // Detect iOS on client side only
  useEffect(() => {
    if (isClient && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent
      const isIOSDevice = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      setIsIOS(isIOSDevice)

      // LocationTracker uses native geolocation + has try/catch for every iOS-risky API
      const trackerTimer = setTimeout(() => setCanMountTracker(true), 2000)

      if (!isIOSDevice) {
        const extrasTimer = setTimeout(() => setCanMountExtras(true), 1000)
        return () => {
          clearTimeout(extrasTimer)
          clearTimeout(trackerTimer)
        }
      }
      return () => clearTimeout(trackerTimer)
    }
  }, [isClient])

  // Load current user id for chat notifications (supabase is a stable module singleton)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
    })
  }, []) // empty deps — supabase singleton never changes


  return (
    <ErrorBoundary>
      <div className="flex h-dvh min-h-0 overflow-hidden">
        <a
          href="#main-content"
          className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-elevation-lg transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        {/* Presence heartbeat - updates last_seen every 60s so officers show as online */}
        <PresenceHeartbeat />

        {/* Broken Arrow Global Alert */}
        <BrokenArrowAlert />

        {/* Dev tools - DISABLED on iOS */}
        {canMountExtras && !isIOS && <DevLoggerInit />}

        {/* Location tracking — enabled on ALL devices including iOS */}
        {canMountTracker && (
          <ErrorBoundary>
            <LocationTracker />
          </ErrorBoundary>
        )}

        {/* Location enforcer — prompts users who haven't granted permission.
            Mounted on ALL devices (incl. iOS): its Enable button provides the
            user gesture iOS requires for the native geolocation prompt. */}
        {canMountTracker && (
          <ErrorBoundary>
            <LocationEnforcer />
          </ErrorBoundary>
        )}

        {/* Online status - DISABLED on iOS */}
        {canMountExtras && !isIOS && (
          <ErrorBoundary>
            <OnlineStatusBanner />
          </ErrorBoundary>
        )}

        {/* Desktop Sidebar — push layout from nav (860px) up */}
        <div className="relative hidden h-full min-h-0 overflow-visible nav:flex">
          <ErrorBoundary>
            <Suspense fallback={<div className="h-full w-[248px] bg-background animate-pulse" />}>
              <Sidebar />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Mobile / tablet off-canvas drawer (below 860px) */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-40 flex pointer-events-auto nav:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setMobileSidebarOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="relative z-50 h-full w-[248px] max-w-[80%] shadow-2xl"
              >
                <ErrorBoundary>
                  <Suspense fallback={<div className="h-full w-[248px] bg-background animate-pulse" />}>
                    <Sidebar isMobile onClose={() => setMobileSidebarOpen(false)} />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            <Header
              sidebarOpen={mobileSidebarOpen}
              onOpenSidebar={() => setMobileSidebarOpen((o) => !o)}
            />
          </ErrorBoundary>

          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-gradient-to-br from-orange-50 via-background to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 px-3 py-4 sm:px-4 sm:py-6"
          >
            <div className="mx-auto max-w-6xl min-w-0 space-y-6 animate-fade-in">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
        {/* Floating UI safe on every platform (install prompt is how iOS users
            learn about Add to Home Screen; password enforcer is plain UI) */}
        {canMountTracker && (
          <>
            <ErrorBoundary>
              <PWAInstallPrompt />
            </ErrorBoundary>
            <ErrorBoundary>
              <PasswordEnforcer />
            </ErrorBoundary>
            <ErrorBoundary>
              <ProfileCompletionEnforcer />
            </ErrorBoundary>
          </>
        )}

        {/* Floating UI still disabled on iOS (Notification API / IndexedDB limits) */}
        {canMountExtras && !isIOS && (
          <>
            <ErrorBoundary>
              <NotificationPermissionBanner />
            </ErrorBoundary>
            <ErrorBoundary>
              <MissionNotificationHandler />
            </ErrorBoundary>
            <ErrorBoundary>
              <SyncStatusBadge />
            </ErrorBoundary>
          </>
        )}
      </div>
    </ErrorBoundary>
  )
}
