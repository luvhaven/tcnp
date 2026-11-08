const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/maps/tile-layer-detach.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod, Error })

const { detachTileLayer, isZoomAnimating } = mod.exports

/** A tile layer that records whether it was taken off the map. */
function fakeLayer() {
  const calls = { off: 0, remove: 0 }
  return {
    calls,
    off: () => { calls.off += 1 },
    remove: () => { calls.remove += 1 },
  }
}

/**
 * A layer that models the one piece of Leaflet's contract this helper can
 * break: a layer is unsubscribed from its map by a `once('remove')` listener
 * stored ON THE LAYER (`Layer._layerAdd` in leaflet-src.js), and `off()` with
 * no arguments deletes every listener it has.
 */
function leafletLikeLayer(map) {
  let events = { remove: [() => { map.subscribedToZoom = false }] }
  return {
    off(type) {
      if (type === undefined) { events = {} } else { delete events[type] }
    },
    remove() {
      for (const handler of events.remove || []) handler()
      this._map = null
    },
  }
}

test('a layer is detached immediately when no zoom is animating', () => {
  const layer = fakeLayer()
  detachTileLayer({ _animatingZoom: false, once: () => {} }, layer)
  assert.equal(layer.calls.remove, 1)
})

test('detaching waits for zoomend while a zoom animation is in flight', () => {
  // The production crash: Leaflet queues _updateLevels in requestAnimationFrame
  // during a zoom. Removing the layer first nulls its _map, so that frame threw
  // an unhandled "Cannot read properties of null (reading 'project')".
  // The provider failover fires exactly when tiles stop loading — i.e. on a bad
  // connection, while the user is plausibly pinching the map.
  let handler = null
  const map = { _animatingZoom: true, once: (event, fn) => { assert.equal(event, 'zoomend'); handler = fn } }
  const layer = fakeLayer()

  detachTileLayer(map, layer)
  assert.equal(layer.calls.remove, 0, 'must not detach mid-animation')
  assert.equal(typeof handler, 'function', 'must register a zoomend handler')

  handler()
  assert.equal(layer.calls.remove, 1, 'must detach once the animation ends')
})

test('a map torn down before zoomend simply never detaches', () => {
  // map.remove() drops Leaflet's listeners, so the handler never runs. The
  // layer dies with the map; what matters is that nothing throws.
  const map = { _animatingZoom: true, once: () => {} }
  assert.doesNotThrow(() => detachTileLayer(map, fakeLayer()))
})

test('a layer that throws while detaching does not propagate', () => {
  const hostile = { remove: () => { throw new Error('map already removed') } }
  assert.doesNotThrow(() => detachTileLayer({}, hostile))
})

test('a detached layer stops receiving the map zoom events', () => {
  // Seen as TCNP-H: 67 unhandled TypeErrors in one burst for a single Command
  // officer on /tracking/live. This function used to call `layer.off()` before
  // `layer.remove()`, which deleted the `once('remove')` listener Leaflet uses
  // to unsubscribe the layer. The layer kept the map's `zoom` subscription with
  // a null `_map`, and every frame of the next pinch called
  // `this._map.getCenter()` on null — hence a burst, not a single event.
  const map = { subscribedToZoom: true, _animatingZoom: false }
  detachTileLayer(map, leafletLikeLayer(map))
  assert.equal(map.subscribedToZoom, false, 'detaching must leave no listener behind')
})

test('a layer detached after a zoom animation also unsubscribes', () => {
  // The deferred path runs the same detach, so it must not regress separately.
  let handler = null
  const map = {
    subscribedToZoom: true,
    _animatingZoom: true,
    once: (event, fn) => { handler = fn },
  }
  detachTileLayer(map, leafletLikeLayer(map))
  assert.equal(map.subscribedToZoom, true, 'still attached until zoomend')
  handler()
  assert.equal(map.subscribedToZoom, false)
})

test('missing maps, layers and animation flags are all tolerated', () => {
  assert.equal(isZoomAnimating(null), false)
  assert.equal(isZoomAnimating(undefined), false)
  assert.equal(isZoomAnimating({}), false)
  assert.equal(isZoomAnimating({ _animatingZoom: true }), true)
  assert.doesNotThrow(() => detachTileLayer(null, null))
  assert.doesNotThrow(() => detachTileLayer(null, fakeLayer()))
  // An animating map with no `once` must still detach rather than silently skip.
  const layer = fakeLayer()
  detachTileLayer({ _animatingZoom: true }, layer)
  assert.equal(layer.calls.remove, 1)
})
