/**
 * Safe removal of a Leaflet tile layer.
 *
 * Deliberately free of imports (including Leaflet's own types) so the logic
 * can be unit-tested without a DOM or a real map; the shapes below describe
 * only what is touched.
 */

type ZoomAnimatableMap = {
  /** Leaflet's internal flag, set for the duration of a zoom animation. */
  _animatingZoom?: boolean
  once?: (event: string, handler: () => void) => unknown
}

type DetachableLayer = {
  remove?: () => unknown
}

/**
 * True while Leaflet is mid zoom animation.
 *
 * `_animatingZoom` is private, but Leaflet exposes no public equivalent and
 * the flag has been stable across v1.x. Treated as advisory: a wrong answer
 * costs a frame of stale tiles, never a crash.
 */
export function isZoomAnimating(map: unknown): boolean {
  if (typeof map !== 'object' || map === null) return false
  return (map as ZoomAnimatableMap)._animatingZoom === true
}

/**
 * Detach a tile layer without racing Leaflet's zoom animation.
 *
 * A zoom animation queues `_updateLevels` in requestAnimationFrame. Removing
 * the layer first nulls its `_map`, so when that frame runs it dereferences
 * null and throws an UNHANDLED
 * `TypeError: Cannot read properties of null (reading 'project')`.
 *
 * This matters here because the tile-provider failover removes a layer the
 * moment tiles stop loading — common on poor connections, and exactly when a
 * user is likely to be pinching the map. Waiting for `zoomend` lets the
 * queued frame find the map it expects.
 *
 * Detaching is `remove()` and nothing else — see the note inside. Seen as
 * TCNP-H when this function also called `off()`.
 */
export function detachTileLayer(map: unknown, layer: unknown): void {
  if (!layer || typeof layer !== 'object') return

  const detach = () => {
    const target = layer as DetachableLayer
    try {
      // `remove()` only. Never call `layer.off()` here, however tempting it
      // looks for silencing a dying layer's tile events.
      //
      // Leaflet unsubscribes a layer from its map through a `once('remove')`
      // listener stored ON THE LAYER (`Layer._layerAdd`), and `off()` with no
      // arguments deletes every listener — that one included. The layer then
      // keeps the map's `zoom` and `viewreset` subscriptions while `_map` is
      // null, so the next zoom frame calls `this._map.getCenter()` on null.
      //
      // `remove()` alone is enough: it fires 'remove', which runs Leaflet's
      // own unsubscribe, and our `tileload`/`tileerror` handlers die with the
      // layer (they also no-op via the `baseLayerRef.current !== layer` guard).
      target.remove?.()
    } catch {
      /* The map may already be torn down; nothing left to detach. */
    }
  }

  const candidate = map as ZoomAnimatableMap | null
  if (isZoomAnimating(candidate) && typeof candidate?.once === 'function') {
    // Leaflet clears its listeners on map.remove(), so an unmount before
    // zoomend simply drops this — the layer dies with the map either way.
    candidate.once('zoomend', detach)
    return
  }

  detach()
}
