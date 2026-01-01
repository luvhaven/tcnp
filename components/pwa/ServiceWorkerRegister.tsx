'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            'serviceWorker' in navigator &&
            (window as any).workbox === undefined
        ) {
            const wb = (window as any).workbox
            if (!wb) {
                // Standard registration if workbox is not available directly
                navigator.serviceWorker
                    .register('/sw.js')
                    .then((registration) => {
                        console.log('✅ Service Worker registered with scope:', registration.scope)
                    })
                    .catch((error) => {
                        console.error('❌ Service Worker registration failed:', error)
                    })
            }
        }
    }, [])

    return null
}
