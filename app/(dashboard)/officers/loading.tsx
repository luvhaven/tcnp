export default function OfficersLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-32 rounded-lg bg-muted" />
                    <div className="h-4 w-64 rounded-md bg-muted" />
                </div>
                <div className="h-10 w-32 rounded-lg bg-muted" />
            </div>

            {/* Stat cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
                        <div className="h-4 w-24 rounded bg-muted" />
                        <div className="h-8 w-12 rounded bg-muted" />
                    </div>
                ))}
            </div>

            {/* Tab bar */}
            <div className="flex gap-4 border-b pb-2">
                {['Directory', 'Manage', 'Pending'].map((tab) => (
                    <div key={tab} className="h-5 w-20 rounded bg-muted" />
                ))}
            </div>

            {/* Officer cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
                            <div className="space-y-1 flex-1 min-w-0">
                                <div className="h-4 w-32 rounded bg-muted" />
                                <div className="h-3 w-44 rounded bg-muted" />
                            </div>
                            <div className="h-5 w-16 rounded-full bg-muted" />
                        </div>
                        <div className="space-y-1">
                            <div className="h-3 w-full rounded bg-muted" />
                            <div className="h-3 w-3/4 rounded bg-muted" />
                        </div>
                        <div className="flex gap-2">
                            <div className="h-8 w-16 rounded bg-muted" />
                            <div className="h-8 w-16 rounded bg-muted" />
                            <div className="h-8 w-8 rounded bg-muted ml-auto" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
