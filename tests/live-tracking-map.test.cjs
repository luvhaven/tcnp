const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('empty tracking state is a compact notice, not a map-covering overlay', () => {
  const source = fs.readFileSync('components/tracking/LiveTrackingMap.tsx', 'utf8')
  const emptyState = source.split('{/* Empty state */}')[1].split('</CardContent>')[0]
  assert.match(emptyState, /role="status"/)
  assert.match(emptyState, /pointer-events-none/)
  assert.match(emptyState, /max-w-sm/)
  assert.doesNotMatch(emptyState, /inset-0|backdrop-blur/)
  // The leaflet map must stay behind the isClient gate (it touches window on
  // import), but not necessarily as the gate's immediate child — dae749ad put an
  // ErrorBoundary in between, which is the fix for the zoom crash, not a
  // regression. Assert the gate and the map, not what sits between them.
  const clientGated = source.split('{isClient && (')[1]
  assert.ok(clientGated, 'LiveTrackingLeaflet is no longer rendered behind an isClient gate')
  // Bounded so the gate still has to be the one wrapping the map, rather than
  // any isClient gate anywhere above it in the file.
  assert.match(clientGated.slice(0, 1500), /<LiveTrackingLeaflet/)
})

test('failed tile placeholders cannot cancel provider fallback', () => {
  const source = fs.readFileSync('components/tracking/LiveTrackingLeaflet.tsx', 'utf8')
  assert.match(source, /failedTiles\.add\(event\.tile\)/)
  const loadHandler = source.split("layer.on('tileload'")[1].split('layer.addTo(map)')[0]
  assert.ok(loadHandler.indexOf('failedTiles.has(event.tile)') < loadHandler.indexOf('loadedTileCountRef.current += 1'))
  assert.match(loadHandler, /baseLayerRef\.current !== layer/)
})
