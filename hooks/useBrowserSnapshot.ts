'use client'
import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
/** Hydration-safe snapshot of a stable browser value (return a primitive). */
export function useBrowserSnapshot<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribe, read, () => serverValue)
}

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify) }
}
export function useOnlineStatus() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
