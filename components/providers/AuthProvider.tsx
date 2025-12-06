"use client"

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        // Set up auth state listener
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            // Handle session changes
            if (event === 'SIGNED_OUT') {
                // Clear any client-side cache
                router.push('/login')
            } else if (event === 'TOKEN_REFRESHED') {
                // Session was refreshed successfully
                console.log('Session refreshed successfully')
            } else if (event === 'SIGNED_IN') {
                // User signed in
                router.refresh()
            }
        })

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe()
        }
    }, [router, supabase])

    // Periodic session health check
    useEffect(() => {
        const checkSession = setInterval(async () => {
            const { data: { session }, error } = await supabase.auth.getSession()
            if (error) {
                console.warn('⚠️ Session check error:', error.message)
            }
            if (!session) {
                console.warn('⚠️ Session lost, user will be redirected on next auth state change')
            }
        }, 60000) // Check every minute

        return () => clearInterval(checkSession)
    }, [supabase])

    return <>{children}</>
}
