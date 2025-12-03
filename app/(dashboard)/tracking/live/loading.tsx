import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LiveTrackingLoading() {
    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col">
            <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                    <Skeleton className="h-8 w-[200px] mb-2" />
                    <Skeleton className="h-4 w-[300px]" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-[100px]" />
                    <Skeleton className="h-9 w-[100px]" />
                </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
                <div className="w-80 border-r bg-background p-4 hidden md:block">
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="flex-1 space-y-1">
                                        <Skeleton className="h-4 w-[100px]" />
                                        <Skeleton className="h-3 w-[60px]" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex-1 relative bg-muted/20">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <Skeleton className="h-4 w-[200px]" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
