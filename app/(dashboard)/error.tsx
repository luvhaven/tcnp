'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

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
        <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/20">
                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Something went wrong!</h2>
                <p className="text-muted-foreground max-w-[500px]">
                    We encountered an unexpected error while loading this page. This might be a temporary glitch.
                </p>
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 rounded-md bg-muted p-4 text-left text-xs font-mono overflow-auto max-w-[600px] max-h-[200px]">
                        {error.message}
                        {error.stack && <pre className="mt-2">{error.stack}</pre>}
                    </div>
                )}
            </div>
            <div className="flex gap-4 pt-4">
                <Button onClick={() => window.location.reload()} variant="outline">
                    Reload Page
                </Button>
                <Button onClick={() => reset()}>Try Again</Button>
            </div>
        </div>
    )
}
