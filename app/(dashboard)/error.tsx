'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react'

/**
 * Route-segment error boundary for every page under (dashboard).
 *
 * Next 16 passes `retry` (re-fetches and re-renders the segment) and the older
 * `reset` (re-renders without re-fetching). Recovery tries them in that order
 * first; if the boundary is still showing after an in-place attempt, the next
 * click falls back to a full reload.
 */
export default function Error({
    error,
    retry,
    reset,
}: {
    error: Error & { digest?: string }
    retry?: () => void
    reset?: () => void
}) {
    const [attempts, setAttempts] = useState(0)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        console.error('Dashboard Error:', error)
        Sentry.captureException(error, { tags: { boundary: 'dashboard-error' } })
    }, [error])

    const recover = () => {
        const inPlace = retry ?? reset
        // If this component is still mounted after an in-place attempt, that
        // attempt failed: a reload also refreshes the JS chunks and session.
        if (attempts === 0 && inPlace) {
            setAttempts(1)
            startTransition(() => inPlace())
            return
        }
        window.location.reload()
    }

    return (
        <div className="flex min-h-[50vh] items-center justify-center p-4">
            <Card className="max-w-md w-full border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                        Something went wrong
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This page hit an unexpected problem and couldn&apos;t be shown. Your data is safe, so try again
                        or head back to the dashboard.
                    </p>
                    {process.env.NODE_ENV === 'development' && (
                        <div className="rounded-md bg-black/5 p-2 text-xs font-mono text-red-600 dark:text-red-400 overflow-auto max-h-32">
                            {error.message}
                        </div>
                    )}
                    {error.digest && (
                        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button onClick={recover} pending={isPending} className="flex-1 gap-2">
                            {!isPending && <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
                            {attempts === 0 ? 'Try again' : 'Reload page'}
                        </Button>
                        <Button asChild variant="outline" className="flex-1 gap-2">
                            <Link href="/dashboard">
                                <Home className="h-4 w-4" aria-hidden="true" />
                                Go to dashboard
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
