"use client"

import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider"
import { ConfirmProvider } from "@/components/providers/ConfirmProvider"
import { CelebrateProvider } from "@/components/providers/CelebrateProvider"
import QueryProvider from "@/components/providers/QueryProvider"
import { Toaster } from "sonner"
import { useEffect, useState } from "react"

/** Sonner wired to the app theme — otherwise toasts stay light-styled in dark
 *  mode. closeButton lets users dismiss long-duration operational toasts. */
function ThemedToaster() {
    const { theme } = useTheme()
    return (
        <Toaster
            position="top-right"
            richColors
            closeButton
            theme={theme === 'auto' ? 'system' : theme}
            toastOptions={{
                style: { boxShadow: 'var(--shadow-lg)' },
                className: 'rounded-xl',
            }}
        />
    )
}

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
                        <QueryProvider>
                            <ConfirmProvider>
                                <CelebrateProvider>
                                    {children}
                                </CelebrateProvider>
                            </ConfirmProvider>
                        </QueryProvider>
                    </AuthProvider>
                </ErrorBoundary>

                {/* Toaster can sometimes cause hydration issues on iOS, wait for mount */}
                {mounted && (
                    <ErrorBoundary>
                        <ThemedToaster />
                    </ErrorBoundary>
                )}
            </ThemeProvider>
        </ErrorBoundary>
    )
}
