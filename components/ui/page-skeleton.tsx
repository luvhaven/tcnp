import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ─── Table page skeleton (list pages with header + table)
export function TablePageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Filter row */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-muted/50 px-4 py-3 flex gap-4">
          {[40, 28, 20, 20, 16].map((w, i) => (
            <Skeleton key={i} className={`h-4 w-${w}`} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-4 border-t flex items-center gap-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Card grid page skeleton (card-based pages)
export function CardGridPageSkeleton({ cards = 6, cols = 3 }: { cards?: number; cols?: number }) {
  const gridClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  }[cols] ?? 'md:grid-cols-3'

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className={cn('grid gap-4', gridClass)}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 flex-1 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Stats + cards (for dashboard)
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-1">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
      {/* Two column section */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-5 space-y-3">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 py-2 border-b last:border-0">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Simple detail page skeleton
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-5 space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Journey / Ops skeleton
export function JourneySkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      {/* Journey cards */}
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="border rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          {/* Phase timeline */}
          <div className="flex items-center gap-2 mb-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-1">
                <Skeleton className="h-8 w-8 rounded-full" />
                {j < 3 && <Skeleton className="h-0.5 w-6" />}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}
