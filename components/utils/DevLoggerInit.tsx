'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { setDevAdminStatus } from '@/lib/utils/devLogger'

/**
 * Component that initializes dev logging based on user role
 * Only dev_admin users will see console errors/warnings
 */
export function DevLoggerInit() {
    useEffect(() => {
        const init = async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()

                if (user) {
                    const { data: userData } = await supabase
                        .from('users')
                        .select('role')
                        .eq('id', user.id)
                        .single()

                    // Enable dev logging only for dev_admin
                    setDevAdminStatus(userData?.role === 'dev_admin')
                }
            } catch (error) {
                // Silent  fail - non-critical
            }
        }

        init()
    }, [])

    return null
}
