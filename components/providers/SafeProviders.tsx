"use client"

import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { ThemeProvider } from "@/components/theme/ThemeProvider"
import { Toaster } from "sonner"
import { useEffect, useState } from "react"

export function SafeProviders({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <ErrorBoundary>
            <ThemeProvider>
                {/* AuthProvider is critical, but we wrap it to prevent white-screen of death */}
                <ErrorBoundary>
                    <AuthProvider>
                        {children}
                    </AuthProvider>
                </ErrorBoundary>

                {/* Toaster can sometimes cause hydration issues on iOS, wait for mount */}
                {mounted && (
                    <ErrorBoundary>
                        <Toaster position="top-right" richColors />
                    </ErrorBoundary>
                )}
            </ThemeProvider>
        </ErrorBoundary>
    )
}
