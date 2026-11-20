"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, RotateCcw, Check, ScanFace, Loader2, ImageOff } from "lucide-react"
import {
  PHOTO_CANNOT_OPEN_MESSAGE, PHOTO_CANNOT_PREPARE_MESSAGE, canvasToBlob, convertWithImageBitmap,
} from "@/lib/headshot-image"

const VIEWPORT_SIZE = 288 // CSS px — square crop window shown to the user
const OUTPUT_SIZE = 512   // px — exported headshot resolution
const MIN_ZOOM = 1
const MAX_ZOOM = 4

type Point = { x: number; y: number }
/** loading: the browser is opening the photo; converting: a second decoder is trying. */
type LoadStatus = "idle" | "loading" | "converting" | "ready" | "error"

/**
 * Canvas-based headshot cropper. Full-length or group photos are common
 * uploads here — this lets the officer zoom/drag to isolate just the face,
 * with a native FaceDetector-based auto-frame as a progressive enhancement
 * (Chrome/Edge only; every other browser falls back to plain manual crop,
 * which is fully functional on its own).
 */
export function HeadshotCropDialog({
  file,
  open,
  onClose,
  onCropped,
  onChooseAnother,
}: {
  file: File | null
  open: boolean
  onClose: () => void
  onCropped: (blob: Blob) => void
  /** Offered when the photo cannot be opened, so the officer can pick another. */
  onChooseAnother?: () => void
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [faceFound, setFaceFound] = useState<boolean | null>(null)
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const dragStartRef = useRef<{ pointer: Point; pan: Point } | null>(null)
  // Object URLs created for the current file (the original, and a converted
  // JPEG when the browser could not open the original). Revoked on change.
  // One object per chosen file; `cancelled` is set when a different file
  // replaces it, so a slow conversion of the old file is ignored.
  const loadRef = useRef<{ cancelled: boolean; converted: boolean; urls: string[] }>({ cancelled: true, converted: false, urls: [] })

  // Load the file into an object URL whenever a new one is provided. Every
  // piece of state from the previous photo is cleared: a stale size would
  // otherwise leave "Use photo" enabled over a photo that never opened.
  useEffect(() => {
    const load = { cancelled: false, converted: false, urls: [] as string[] }
    loadRef.current = load
    setNaturalSize(null)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setFaceFound(null)
    setErrorMessage(null)
    setPreparing(false)
    if (!file) { setImgUrl(null); setStatus("idle"); return }
    const url = URL.createObjectURL(file)
    load.urls.push(url)
    setImgUrl(url)
    setStatus("loading")
    return () => {
      load.cancelled = true
      for (const u of load.urls) URL.revokeObjectURL(u)
    }
  }, [file])

  const baseScale = naturalSize
    ? VIEWPORT_SIZE / Math.min(naturalSize.w, naturalSize.h)
    : 1
  const effectiveScale = baseScale * zoom

  const attemptFaceDetection = useCallback(async (img: HTMLImageElement, w: number, h: number) => {
    const FaceDetectorCtor = (window as any).FaceDetector
    if (!FaceDetectorCtor) return // Not supported here — manual crop still works fully
    setDetecting(true)
    try {
      const detector = new FaceDetectorCtor({ maxDetectedFaces: 1, fastMode: true })
      const faces = await detector.detect(img)
      if (faces && faces.length > 0) {
        const box = faces[0].boundingBox
        // Centre of the detected face, in natural-image pixel space
        const faceCenterX = box.x + box.width / 2
        const faceCenterY = box.y + box.height / 2
        // Zoom so the face (plus headshot margin) roughly fills the frame
        const targetFaceFrac = 0.42 // face height as a fraction of the crop frame
        const desiredScale = (VIEWPORT_SIZE * targetFaceFrac) / box.height
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, desiredScale / baseScale))
        const newEffScale = baseScale * newZoom
        // Pan needed to bring the face centre to the viewport centre
        const imgCenterX = w / 2
        const imgCenterY = h / 2
        setZoom(newZoom)
        setPan({
          x: (imgCenterX - faceCenterX) * newEffScale,
          // Bias slightly up so there's headroom above the face, chin near the lower third
          y: (imgCenterY - faceCenterY) * newEffScale + VIEWPORT_SIZE * 0.08,
        })
        setFaceFound(true)
      } else {
        setFaceFound(false)
      }
    } catch {
      setFaceFound(false)
    } finally {
      setDetecting(false)
    }
  }, [baseScale])

  // The browser could not open the photo (an iPhone HEIC photo outside
  // Safari, a gallery item that never downloaded, a damaged file). Try the
  // second decoder once, converting to JPEG; otherwise say so plainly.
  const handleImageError = async () => {
    const load = loadRef.current
    if (!file || load.cancelled || load.converted) {
      setStatus("error")
      setErrorMessage(PHOTO_CANNOT_OPEN_MESSAGE)
      return
    }
    load.converted = true
    setStatus("converting")
    const converted = await convertWithImageBitmap(file)
    if (load.cancelled) return // a different photo was chosen meanwhile
    if (!converted) {
      setStatus("error")
      setErrorMessage(PHOTO_CANNOT_OPEN_MESSAGE)
      return
    }
    const url = URL.createObjectURL(converted)
    load.urls.push(url)
    setImgUrl(url)
  }

  const handleImageLoad = () => {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) { void handleImageError(); return }
    setNaturalSize({ w, h })
    setStatus("ready")
    void attemptFaceDetection(img, w, h)
  }

  // ── Drag to pan ────────────────────────────────────────────────────────
  const clampPan = useCallback((next: Point, scale: number): Point => {
    if (!naturalSize) return next
    const displayedW = naturalSize.w * scale
    const displayedH = naturalSize.h * scale
    // Max pan so the image never leaves the viewport uncovered
    const maxX = Math.max(0, (displayedW - VIEWPORT_SIZE) / 2)
    const maxY = Math.max(0, (displayedH - VIEWPORT_SIZE) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }, [naturalSize])

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true)
    dragStartRef.current = { pointer: { x: e.clientX, y: e.clientY }, pan }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.pointer.x
    const dy = e.clientY - dragStartRef.current.pointer.y
    setPan(clampPan({ x: dragStartRef.current.pan.x + dx, y: dragStartRef.current.pan.y + dy }, effectiveScale))
  }
  const onPointerUp = () => { setDragging(false); dragStartRef.current = null }

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
    setZoom(clamped)
    setPan(p => clampPan(p, baseScale * clamped))
  }

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  const confirmCrop = async () => {
    const img = imgRef.current
    if (!img || !naturalSize || status !== "ready" || preparing) return
    setPreparing(true)
    setErrorMessage(null)
    try {
      const blob = await cropToBlob(img, naturalSize)
      if (!blob) { setErrorMessage(PHOTO_CANNOT_PREPARE_MESSAGE); return }
      onCropped(blob)
    } catch {
      setErrorMessage(PHOTO_CANNOT_PREPARE_MESSAGE)
    } finally {
      setPreparing(false)
    }
  }

  // Draws the framed area at OUTPUT_SIZE and encodes it as a JPEG. Resolves
  // null when the browser cannot encode (canvas.toBlob gave nothing).
  const cropToBlob = (img: HTMLImageElement, naturalSize: { w: number; h: number }): Promise<Blob | null> => {
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return Promise.resolve(null)

    const displayedW = naturalSize.w * effectiveScale
    const displayedH = naturalSize.h * effectiveScale
    const imgLeft = (VIEWPORT_SIZE / 2 - displayedW / 2) + pan.x
    const imgTop = (VIEWPORT_SIZE / 2 - displayedH / 2) + pan.y

    let sx = (0 - imgLeft) / effectiveScale
    let sy = (0 - imgTop) / effectiveScale
    let sw = VIEWPORT_SIZE / effectiveScale
    let sh = VIEWPORT_SIZE / effectiveScale

    // Clamp to natural image bounds (guards against float drift at the edges)
    sx = Math.max(0, Math.min(naturalSize.w - sw, sx))
    sy = Math.max(0, Math.min(naturalSize.h - sh, sy))
    sw = Math.min(sw, naturalSize.w - sx)
    sh = Math.min(sh, naturalSize.h - sy)

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    return canvasToBlob(canvas, "image/jpeg", 0.92)
  }

  const opening = status === "loading" || status === "converting"
  const failedToOpen = status === "error"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* The crop window is a fixed 288px because the export maths depends on
          it, so on a short screen (phone landscape, or portrait once browser
          chrome is subtracted) header + circle + slider + actions exceeded the
          viewport. The dialog is position:fixed, so the overflow simply wasn't
          reachable — "Use Photo" sat below the fold with nothing to scroll.
          dvh tracks the *dynamic* viewport, so this stays correct while mobile
          browser chrome collapses on scroll. */}
      <DialogContent className="flex max-h-[92dvh] max-w-sm flex-col overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Frame Your Headshot</DialogTitle>
          <DialogDescription>
            Drag to reposition and zoom to crop — only the framed area is used as your headshot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            ref={viewportRef}
            className="relative mx-auto overflow-hidden rounded-full border-2 border-primary/50 bg-muted touch-none select-none"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {imgUrl && !failedToOpen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={imgUrl}
                alt="Crop preview"
                onLoad={handleImageLoad}
                onError={() => void handleImageError()}
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: naturalSize?.w,
                  height: naturalSize?.h,
                  visibility: naturalSize ? "visible" : "hidden",
                  maxWidth: "none",
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${effectiveScale})`,
                  transformOrigin: "center center",
                }}
              />
            )}
            {(detecting || opening) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-xs text-white">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                {opening && <span role="status">{status === "converting" ? "Converting photo…" : "Opening photo…"}</span>}
              </div>
            )}
            {failedToOpen && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <ImageOff className="h-10 w-10" aria-hidden="true" />
              </div>
            )}
          </div>

          {errorMessage && (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-center text-sm">
              <p>{errorMessage}</p>
              {failedToOpen && onChooseAnother && (
                <Button type="button" variant="outline" size="sm" onClick={onChooseAnother}>
                  Choose another photo
                </Button>
              )}
            </div>
          )}

          {faceFound !== null && (
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <ScanFace className="h-3.5 w-3.5" />
              {faceFound ? "Face detected — auto-framed, fine-tune if needed" : "No face auto-detected — frame it manually below"}
            </p>
          )}

          <div className="flex items-center gap-2 px-2">
            <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-primary"
              aria-label="Zoom"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          {/* Pinned to the bottom of the scroll area: even if the crop window
              does push the dialog past the viewport, the confirm action stays
              on screen rather than requiring a scroll to discover. */}
          <div className="sticky bottom-0 -mx-6 -mb-6 flex gap-2 border-t bg-background px-6 pb-6 pt-3">
            <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={reset} disabled={status !== "ready"}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" className="flex-1 gap-1.5" onClick={() => void confirmCrop()} disabled={status !== "ready" || !naturalSize || preparing}>
              {preparing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {preparing ? "Preparing…" : "Use Photo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
