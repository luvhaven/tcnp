'use client'

import { useState } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { LocationTracker } from "@/components/tracking/LocationTracker"
import NotificationPermissionBanner from "@/components/notifications/NotificationPermissionBanner"
import { DevLoggerInit } from "@/components/utils/DevLoggerInit"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <DevLoggerInit />
      <LocationTracker />

      <div className="hidden h-full md:flex">
        <Sidebar />
      </div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 h-full w-72 max-w-[80%]">
            <Sidebar isMobile onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-orange-50 via-background to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 px-3 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
      <NotificationPermissionBanner />
    </div>
  )
}
