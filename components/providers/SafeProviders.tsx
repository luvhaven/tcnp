"use client"

import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider"
import { ConfirmProvider } from "@/components/providers/ConfirmProvider"
import { CelebrateProvider } from "@/components/providers/CelebrateProvider"
import QueryProvider from "@/components/providers/QueryProvider"
import { Toaster } from "sonner"
import { useIsClient } from "@/hooks/useIsClient"

/** Sonner wired to the app theme — otherwise toasts stay light-styled in dark
 *  mode. closeButton lets users dismiss long-duration operational toasts.
 *
 *  top-center keeps toasts clear of the bottom tab bar and floating notices
 *  on phones; the offset clears the notch/status bar in the installed app;
 *  visibleToasts 3 stops a burst of failures from burying the page. */
const TOAST_OFFSET = 'calc(env(safe-area-inset-top) + 0.75rem)'

function ThemedToaster() {
    const { theme } = useTheme()
    return (
        <Toaster
            position="top-center"
            offset={TOAST_OFFSET}
            mobileOffset={{ top: TOAST_OFFSET, left: '1rem', right: '1rem' }}
            visibleToasts={3}
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
    const mounted = useIsClient()

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
