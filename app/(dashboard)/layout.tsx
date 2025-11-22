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
        <main className="flex-1 overflow-y-auto bg-background p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
