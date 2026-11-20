/**
 * Helpers for headshot photos (the officer's own profile page and the
 * Officers page). Phones hand us photos the browser cannot always open:
 * iPhone HEIC files in Chrome, Android or Windows, cloud-only gallery items
 * that never downloaded, or damaged files. These helpers decode what the
 * browser can, convert it to a plain JPEG, and turn every failure into a
 * sentence the officer can act on.
 */

import { UserFacingError } from "@/lib/notify"

/** Shown whenever the browser cannot open the chosen photo. */
export const PHOTO_CANNOT_OPEN_MESSAGE =
  "This photo can't be opened here. Choose a JPG or PNG, or take a screenshot of the photo and use that."

/** Shown when the photo opened but could not be turned into a headshot file. */
export const PHOTO_CANNOT_PREPARE_MESSAGE =
  "This photo couldn't be prepared. Try again, or choose a different JPG or PNG photo."

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i

/**
 * True when the file is a photo. Some Android and Windows pickers give HEIC
 * files an empty type, so the file name is checked as well.
 */
export function looksLikeImage(file: Pick<File, "type" | "name">): boolean {
  if (file.type) return file.type.startsWith("image/")
  return IMAGE_EXTENSIONS.test(file.name || "")
}

/**
 * A plain sentence for a failed Storage upload, or null when the error is not
 * one we recognise (the caller then falls back to notifyError's handling,
 * which covers permissions, offline and expired sessions).
 */
export function describeStorageUploadError(err: unknown): string | null {
  if (!err || typeof err !== "object") return null
  const message = String((err as { message?: unknown }).message ?? "")
  const status = String((err as { statusCode?: unknown; status?: unknown }).statusCode ?? (err as { status?: unknown }).status ?? "")
  if (status === "413" || /exceeded the maximum allowed size|payload too large|too large/i.test(message)) {
    return "This photo is too large to upload. Choose a smaller photo, or take a screenshot of it and use that."
  }
  if (status === "415" || /mime type|not supported|invalid_mime/i.test(message)) {
    return "This type of photo isn't accepted. Choose a JPG or PNG photo."
  }
  if (/bucket not found/i.test(message)) {
    return "Photo storage isn't available right now. Please tell an administrator."
  }
  return null
}

/** Wraps an upload error so notifyError shows the real reason when we know it. */
export function uploadErrorForUser(err: unknown): unknown {
  const sentence = describeStorageUploadError(err)
  return sentence ? new UserFacingError(sentence) : err
}

/** canvas.toBlob as a promise; resolves null when the browser could not encode. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob | null> {
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Decodes `file` with createImageBitmap (a second decoder some browsers have
 * for formats an <img> refuses) and re-encodes it as a JPEG no larger than
 * `maxSide` on its longest edge. Returns null when the browser cannot decode
 * the file at all.
 */
export async function convertWithImageBitmap(file: Blob, maxSide = 2048): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    if (!bitmap.width || !bitmap.height) return null
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await canvasToBlob(canvas)
  } catch {
    return null
  } finally {
    bitmap?.close?.()
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error("empty image")))
    img.onerror = () => reject(new Error("decode failed"))
    img.src = url
  })
}

/**
 * Turns any photo the browser can open into a JPEG no larger than `maxSide`,
 * for buckets that only accept common types and small files. Throws a
 * UserFacingError with plain guidance when the photo cannot be opened.
 */
export async function photoToJpeg(file: File, maxSide = 1024): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    let img: HTMLImageElement | null = null
    try {
      img = await loadImage(url)
    } catch {
      const converted = await convertWithImageBitmap(file, maxSide)
      if (converted) return converted
      throw new UserFacingError(PHOTO_CANNOT_OPEN_MESSAGE)
    }
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new UserFacingError(PHOTO_CANNOT_PREPARE_MESSAGE)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas)
    if (!blob) throw new UserFacingError(PHOTO_CANNOT_PREPARE_MESSAGE)
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
