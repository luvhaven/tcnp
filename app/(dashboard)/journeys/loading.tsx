export default function JourneysLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-32 rounded-lg bg-muted" />
                    <div className="h-4 w-56 rounded-md bg-muted" />
                </div>
                <div className="h-10 w-36 rounded-lg bg-muted" />
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
                        <div className="h-4 w-20 rounded bg-muted" />
                        <div className="h-8 w-10 rounded bg-muted" />
                    </div>
                ))}
            </div>

            {/* Journey rows */}
            <div className="rounded-xl border bg-card overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4 border-b last:border-b-0">
                        <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
                        <div className="flex-1 space-y-2 min-w-0">
                            <div className="h-4 w-40 rounded bg-muted" />
                            <div className="h-3 w-64 rounded bg-muted" />
                        </div>
                        <div className="h-6 w-20 rounded-full bg-muted" />
                        <div className="h-8 w-8 rounded bg-muted" />
                    </div>
                ))}
            </div>
        </div>
    )
}
