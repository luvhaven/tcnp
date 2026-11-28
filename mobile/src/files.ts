import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/**
 * Exports (CSV, Excel, PDF) made by the TCNP screens.
 *
 * A web page saves a file by "downloading" a blob, which does nothing inside a
 * phone app: there is no downloads bar to catch it. The page hands the file to
 * the app instead, and the app opens the phone's own share sheet so the
 * officer can save it to Files or Drive, or send it straight on.
 */
const MAX_BASE64_LENGTH = 28_000_000 // about 20 MB of file
const SAFE_NAME = /[^A-Za-z0-9._ -]+/g

export async function saveSharedFile(name: unknown, mime: unknown, base64: unknown): Promise<void> {
  if (typeof base64 !== 'string' || !base64 || base64.length > MAX_BASE64_LENGTH) throw new Error('This file is too large to export from the app.')
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('This file could not be read.')
  // A file name from the page is only ever a name: no folders, no leading dots.
  const cleaned = (typeof name === 'string' ? name : '').replace(SAFE_NAME, '_').replace(/^\.+/, '').slice(0, 120) || 'tcnp-export'
  const file = new File(Paths.cache, cleaned)
  try { file.create({ overwrite: true, intermediates: true }) } catch { /* written below either way */ }
  file.write(base64, { encoding: 'base64' })
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone has nowhere to send the file.')
  await Sharing.shareAsync(file.uri, {
    mimeType: typeof mime === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : 'application/octet-stream',
    dialogTitle: cleaned,
  })
}
