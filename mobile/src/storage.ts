import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

/**
 * Small encrypted store shared by the screen and the background location task.
 * AFTER_FIRST_UNLOCK lets the task read it while the phone is locked (the
 * default would refuse until the officer unlocks again).
 */
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

const KEYS = {
  token: 'tcnp.location.token',
  ingestUrl: 'tcnp.location.ingestUrl',
  deviceId: 'tcnp.device.id',
  lastSentAt: 'tcnp.location.lastSentAt',
} as const

async function read(key: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(key, options) } catch { return null }
}
async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key, options)
    else await SecureStore.setItemAsync(key, value, options)
  } catch { /* storage unavailable: the caller's in-memory copy still works this session */ }
}

export type Upload = { token: string; ingestUrl: string }

export async function getUpload(): Promise<Upload | null> {
  const [token, ingestUrl] = await Promise.all([read(KEYS.token), read(KEYS.ingestUrl)])
  return token && ingestUrl ? { token, ingestUrl } : null
}
export async function setUpload(upload: Upload | null): Promise<void> {
  await Promise.all([write(KEYS.token, upload?.token ?? null), write(KEYS.ingestUrl, upload?.ingestUrl ?? null)])
  if (!upload) await write(KEYS.lastSentAt, null)
}

export async function getLastSentAt(): Promise<number | null> {
  const value = Number(await read(KEYS.lastSentAt))
  return Number.isFinite(value) && value > 0 ? value : null
}
export const setLastSentAt = (value: number) => write(KEYS.lastSentAt, String(value))

/** A stable id for this install, so the server keeps one live pin per phone. */
let deviceId: string | null = null
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId
  let stored = await read(KEYS.deviceId)
  if (!stored || !/^[A-Za-z0-9_-]{8,64}$/.test(stored)) {
    stored = Crypto.randomUUID()
    await write(KEYS.deviceId, stored)
  }
  deviceId = stored
  return stored
}
