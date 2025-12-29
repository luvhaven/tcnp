'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Global Error:', error)
    }, [error])

    return (
        <html>
            <body>
                <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
                    <div className="flex flex-col items-center max-w-md text-center space-y-4">
                        <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                            Critical Application Error
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            Something went wrong. Please try refreshing the page.
                        </p>
                        <Button
                            onClick={() => {
                                if (typeof window !== 'undefined') {
                                    window.location.reload()
                                }
                            }}
                            className="w-full"
                        >
                            Reload Application
                        </Button>
                    </div>
                </div>
            </body>
        </html>
    )
}
