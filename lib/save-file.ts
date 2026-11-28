import { isNativeShell, requestNative } from '@/lib/native-shell'

/**
 * Saves an export (CSV, Excel, PDF, JSON) for the officer.
 *
 * In a browser this is an ordinary download. Inside the phone app a download
 * goes nowhere, so the file is handed to the app, which opens the phone's
 * share sheet (save to Files or Drive, or send it on). Resolves once the file
 * has been handed over; rejects with a message fit to show the officer.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (isNativeShell()) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('The file could not be prepared. Please retry.'))
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
      reader.readAsDataURL(blob)
    })
    await requestNative('file:save', { name: filename, mime: blob.type.split(';')[0] || 'application/octet-stream', data }, 120_000)
    return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** The message to show when an export fails, whatever was thrown. */
export const saveFileError = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'The export could not be saved. Please retry.'

/**
 * Opens a stored document (a signed storage link).
 *
 * In a browser it opens in a new tab as before. Inside the phone app a new tab
 * means being thrown out to the phone's browser, so the file is fetched here
 * and handed to the app's share sheet, where it can be opened or saved.
 */
export async function openStoredFile(url: string, filename: string): Promise<void> {
  if (!isNativeShell()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error('The file could not be downloaded. Please retry.')
  await saveFile(await response.blob(), filename)
}
