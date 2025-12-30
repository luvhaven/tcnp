'use client'

import { useState, Suspense } from "react"
import dynamic from "next/dynamic"
import { useDelayedMount } from "@/hooks/useIsClient"
import { ErrorBoundary } from "@/components/ErrorBoundary"

// Core layout components - loaded normally but wrapped in error boundaries
import { Header } from "@/components/layout/header"

// Dynamically import ALL potentially problematic components with SSR disabled
const Sidebar = dynamic(
  () => import("@/components/layout/sidebar").then((m) => m.Sidebar),
  { ssr: false, loading: () => <div className="w-72 h-full bg-background animate-pulse" /> }
)

const LocationTracker = dynamic(
  () => import("@/components/tracking/LocationTracker").then((m) => m.LocationTracker),
  { ssr: false }
)

const NotificationPermissionBanner = dynamic(
  () => import("@/components/notifications/NotificationPermissionBanner"),
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

/**
 * iOS-Safe Dashboard Layout
 * 
 * This layout is specifically designed to prevent crashes on iOS Safari by:
 * 1. Using dynamic imports with SSR disabled for all browser-dependent components
 * 2. Delaying risky features (location, notifications) until after hydration
 * 3. Wrapping everything in error boundaries to catch any remaining issues
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Wait for client-side hydration before mounting risky features
  const canMountRiskyFeatures = useDelayedMount(2000)

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden">
        {/* Dev tools - only after hydration */}
        {canMountRiskyFeatures && <DevLoggerInit />}

        {/* Location tracking - severely delayed on iOS */}
        {canMountRiskyFeatures && (
          <ErrorBoundary>
            <LocationTracker />
          </ErrorBoundary>
        )}

        {/* Online status - delayed */}
        {canMountRiskyFeatures && (
          <ErrorBoundary>
            <OnlineStatusBanner />
          </ErrorBoundary>
        )}

        {/* Desktop Sidebar */}
        <div className="hidden h-full md:flex">
          <ErrorBoundary>
            <Suspense fallback={<div className="w-72 h-full bg-background animate-pulse" />}>
              <Sidebar />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-50 h-full w-72 max-w-[80%]">
              <ErrorBoundary>
                <Suspense fallback={<div className="w-72 h-full bg-background animate-pulse" />}>
                  <Sidebar isMobile onClose={() => setMobileSidebarOpen(false)} />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            <Header onOpenSidebar={() => setMobileSidebarOpen(true)} />
          </ErrorBoundary>

          <main className="flex-1 overflow-y-auto bg-gradient-to-br from-orange-50 via-background to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 px-3 py-4 sm:px-4 sm:py-6">
            <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>

        {/* Floating UI elements - delayed */}
        {canMountRiskyFeatures && (
          <>
            <ErrorBoundary>
              <NotificationPermissionBanner />
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
