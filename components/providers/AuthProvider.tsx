"use client"

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClient()
    const isAuthenticating = useRef(false)

    useEffect(() => {
        // Set up auth state listener with iOS-safe error handling
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            try {
                // Handle session changes
                if (event === 'SIGNED_OUT') {
                    // Clear any client-side cache
                    isAuthenticating.current = false
                    router.push('/login')
                } else if (event === 'TOKEN_REFRESHED') {
                    // Session was refreshed successfully
                    console.log('Session refreshed successfully')
                } else if (event === 'SIGNED_IN') {
                    // User signed in - only redirect if on an auth page
                    // This prevents unwanted redirects when session is restored on page load
                    isAuthenticating.current = true
                    console.log('User signed in successfully')

                    // Only redirect if coming from login or signup page
                    // Do NOT redirect if user is already on a dashboard sub-page
                    const isOnAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup')
                    if (isOnAuthPage) {
                        setTimeout(() => {
                            router.replace('/dashboard')
                            isAuthenticating.current = false
                        }, 150)
                    } else {
                        isAuthenticating.current = false
                    }
                }
            } catch (error) {
                // Suppress all auth-related errors during authentication
                if (!isAuthenticating.current) {
                    console.warn('Auth state change error (suppressed):', error)
                }
            }
        })

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe()
        }
    }, [router, supabase, pathname])

    // Periodic session health check - with iOS-safe error handling
    useEffect(() => {
        const checkSession = setInterval(async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error && !isAuthenticating.current) {
                    console.warn('⚠️ Session check error:', error.message)
                }
                if (!session && !isAuthenticating.current && !pathname?.startsWith('/login')) {
                    console.warn('⚠️ Session lost, user will be redirected on next auth state change')
                }
            } catch (error) {
                // Silently handle iOS-specific session check errors
                if (!isAuthenticating.current) {
                    console.warn('Session check failed (suppressed):', error)
                }
            }
        }, 60000) // Check every minute

        return () => clearInterval(checkSession)
    }, [supabase, pathname])

    return <>{children}</>
}
