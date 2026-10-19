import { Skeleton } from '@/components/ui/skeleton'

/**
 * Generic fallback while a (dashboard) route segment streams in. Pages with a
 * more specific shape keep their own skeletons (components/ui/page-skeleton).
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
