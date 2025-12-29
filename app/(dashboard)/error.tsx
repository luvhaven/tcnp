'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Dashboard Error:', error)
    }, [error])

    return (
        <div className="flex h-[50vh] items-center justify-center p-4">
            <Card className="max-w-md w-full border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-5 w-5" />
                        Something went wrong
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        We encountered an unexpected error while loading the dashboard.
                    </p>
                    {process.env.NODE_ENV === 'development' && (
                        <div className="rounded-md bg-black/5 p-2 text-xs font-mono text-red-600 dark:text-red-400 overflow-auto max-h-32">
                            {error.message}
                        </div>
                    )}
                    <Button
                        onClick={() => {
                            // Try to recover by reloading location which is more robust than just re-rendering
                            if (typeof window !== 'undefined') {
                                window.location.reload()
                            } else {
                                reset()
                            }
                        }}
                        className="w-full gap-2"
                    >
                        <RefreshCcw className="h-4 w-4" />
                        Reload Dashboard
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
