/**
 * Prepares a phone photo for upload: decodes it in the browser, shrinks it and
 * re-encodes it as a JPEG (a PNG or WebP that already fits is kept as it is). Phone cameras produce 3-12 MB photos and iPhones
 * (and some Samsungs) produce HEIC, which most browsers cannot display and
 * several buckets refuse. A shrunk JPEG fits every bucket and every viewer.
 *
 * Built on lib/headshot-image.ts (the headshot fix), which owns decoding,
 * the second-decoder fallback and the plain-language failure messages.
 */

import { canvasToBlob, looksLikeImage, photoToJpeg, PHOTO_CANNOT_OPEN_MESSAGE } from "@/lib/headshot-image"
import { UserFacingError } from "@/lib/notify"

export const PHOTO_TOO_LARGE_MESSAGE =
  "This photo is too large to upload. Choose a smaller photo, or take a screenshot of it and use that."

/** "IMG_0042.HEIC" -> "IMG_0042.jpg"; an empty or odd name becomes "photo.jpg". */
export function jpegFileName(name: string | null | undefined): string {
  const base = String(name || "").replace(/\.[^./\\]*$/, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "")
  return `${base || "photo"}.jpg`
}

export type PreparePhotoOptions = {
  /** Longest edge in pixels. */
  maxSide?: number
  /** Largest acceptable JPEG; one smaller attempt is made before giving up. */
  maxBytes?: number
}

/** PNG and WebP can be transparent; a JPEG cannot, so these are kept when they already fit. */
const KEPT_TYPES = new Set(["image/png", "image/webp"])
/** Types that may carry transparency and must be flattened onto white, not black. */
const TRANSPARENT_TYPES = new Set(["image/png", "image/webp", "image/gif"])

/** File extension for the prepared photo's storage path ("jpg", "png" or "webp"). */
export function photoExtension(file: Pick<File, "type">): string {
  if (file.type === "image/png") return "png"
  if (file.type === "image/webp") return "webp"
  return "jpg"
}

/**
 * Draws the image onto a white background before encoding it as a JPEG, so
 * transparent areas (cut-out portraits, logos) come out white instead of black.
 * Returns null when the browser cannot decode it this way; the caller then
 * falls back to the shared converter.
 */
async function flattenOnWhite(file: File, maxSide: number): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await canvasToBlob(canvas)
  } finally {
    bitmap.close?.()
  }
}

async function toJpeg(file: File, maxSide: number): Promise<Blob> {
  if (TRANSPARENT_TYPES.has(file.type)) {
    const flat = await flattenOnWhite(file, maxSide)
    if (flat) return flat
  }
  return photoToJpeg(file, maxSide)
}

/**
 * Returns a File ready to upload. A PNG or WebP that already fits is returned
 * unchanged (so transparency survives); anything else is shrunk to a JPEG,
 * with transparent areas filled white. Throws a UserFacingError with plain
 * guidance when the file is not a photo, cannot be opened, or stays too large.
 * Use `photo.type` and `photoExtension(photo)` for the upload, not "jpg".
 */
export async function preparePhotoForUpload(file: File, { maxSide = 1600, maxBytes = 4 * 1024 * 1024 }: PreparePhotoOptions = {}): Promise<File> {
  if (!looksLikeImage(file)) throw new UserFacingError(PHOTO_CANNOT_OPEN_MESSAGE)
  if (KEPT_TYPES.has(file.type) && file.size <= maxBytes) return file
  let blob = await toJpeg(file, maxSide)
  if (blob.size > maxBytes) blob = await toJpeg(file, Math.round(maxSide * 0.6))
  if (blob.size > maxBytes) throw new UserFacingError(PHOTO_TOO_LARGE_MESSAGE)
  return new File([blob], jpegFileName(file.name), { type: "image/jpeg", lastModified: Date.now() })
}
