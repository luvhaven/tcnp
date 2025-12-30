"use client"

import { useState, useEffect } from 'react'

/**
 * Hook to safely detect if we're running on the client.
 * Returns false during SSR and on first render to prevent hydration mismatches.
 * This is the FOUNDATION of iOS safety - all browser-specific code should wait for this.
 */
export function useIsClient(): boolean {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])

    return isClient
}

/**
 * Hook to detect if the current device is iOS (iPhone/iPad).
 * Only returns true after client-side hydration is complete.
 */
export function useIsIOS(): boolean {
    const isClient = useIsClient()
    const [isIOS, setIsIOS] = useState(false)

    useEffect(() => {
        if (isClient && typeof navigator !== 'undefined') {
            const ua = navigator.userAgent
            const isIOSDevice = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
            setIsIOS(isIOSDevice)
        }
    }, [isClient])

    return isIOS
}

/**
 * Hook to safely delay component mounting on iOS devices.
 * This prevents crashes from aggressive browser APIs during hydration.
 * @param delayMs - Delay in milliseconds before returning true (default: 2000ms for iOS, 0 for others)
 */
export function useDelayedMount(delayMs?: number): boolean {
    const isClient = useIsClient()
    const isIOS = useIsIOS()
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        if (!isClient) return

        // On iOS, wait longer to let hydration fully complete
        const delay = delayMs ?? (isIOS ? 2000 : 100)

        const timer = setTimeout(() => {
            setIsReady(true)
        }, delay)

        return () => clearTimeout(timer)
    }, [isClient, isIOS, delayMs])

    return isReady
}
