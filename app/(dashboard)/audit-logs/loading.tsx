import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AuditLogsLoading() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <Skeleton className="h-8 w-[200px] mb-2" />
                    <Skeleton className="h-4 w-[300px]" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-[120px]" />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-[150px]" />
                        <div className="flex gap-2">
                            <Skeleton className="h-9 w-[200px]" />
                            <Skeleton className="h-9 w-[100px]" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="rounded-md border">
                            <div className="h-12 border-b bg-muted/50 px-4 flex items-center">
                                <Skeleton className="h-4 w-full" />
                            </div>
                            {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="h-16 border-b px-4 flex items-center gap-4">
                                    <Skeleton className="h-4 w-[150px]" />
                                    <Skeleton className="h-4 w-[100px]" />
                                    <Skeleton className="h-4 w-[200px]" />
                                    <Skeleton className="h-4 w-[100px] ml-auto" />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-end space-x-2">
                            <Skeleton className="h-8 w-[80px]" />
                            <Skeleton className="h-8 w-[80px]" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
