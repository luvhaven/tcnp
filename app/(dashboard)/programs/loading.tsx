export default function ProgramsLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-28 rounded-lg bg-muted" />
                    <div className="h-4 w-52 rounded-md bg-muted" />
                </div>
                <div className="h-10 w-36 rounded-lg bg-muted" />
            </div>

            {/* Program cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div className="space-y-2">
                                <div className="h-5 w-40 rounded bg-muted" />
                                <div className="h-4 w-24 rounded bg-muted" />
                            </div>
                            <div className="h-6 w-16 rounded-full bg-muted" />
                        </div>
                        <div className="space-y-1">
                            <div className="h-3 w-full rounded bg-muted" />
                            <div className="h-3 w-4/5 rounded bg-muted" />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <div className="h-8 flex-1 rounded bg-muted" />
                            <div className="h-8 w-8 rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
