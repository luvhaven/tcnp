'use client'

import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { LocationTracker } from "@/components/tracking/LocationTracker"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <LocationTracker />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-orange-50 via-background to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 px-4 py-6">
          <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
