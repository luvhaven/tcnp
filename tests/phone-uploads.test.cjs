const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadTs(file, { globals = {}, stubs = {} } = {}) {
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, {
    exports: mod.exports, module: mod, Promise, ...globals,
    require: name => (name in stubs ? stubs[name] : require(name)),
  })
  return mod.exports
}

class UserFacingError extends Error {
  constructor(message) { super(message); this.name = 'UserFacingError'; this.userFacing = true }
}

const uploads = loadTs('lib/security/upload-validation.ts')

test('photo rules refuse HEIC with plain guidance; Serial keeps originals', () => {
  const { validateUploadFiles, UPLOAD_RULES, PHOTO_INPUT_ACCEPT } = uploads
  // Listing image/heic in `accept` makes iOS hand over the original HEIC.
  assert.equal(PHOTO_INPUT_ACCEPT, 'image/*')
  assert.doesNotMatch(UPLOAD_RULES.image.allowedTypes.join(','), /heic|heif/)
  assert.match(validateUploadFiles([{ name: 'IMG_1.HEIC', type: 'image/heic', size: 10 }], UPLOAD_RULES.image), /HEIC.*JPG or PNG/)
  assert.match(validateUploadFiles([{ name: 'IMG_2.heic', type: '', size: 10 }], UPLOAD_RULES.image), /HEIC/)
  assert.equal(validateUploadFiles([{ name: 'IMG_1.HEIC', type: 'image/heic', size: 10 }], UPLOAD_RULES.media), null)
  // Papa photos pass through a Vercel function (4.5 MB body limit).
  assert.match(validateUploadFiles([{ name: 'a.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 }], UPLOAD_RULES.functionPhoto), /larger than 4 MB/)
  // Room photos mirror the nest-room-media bucket (no GIF).
  assert.match(validateUploadFiles([{ name: 'a.gif', type: 'image/gif', size: 10 }], UPLOAD_RULES.roomPhoto), /not a supported/)
  assert.equal(validateUploadFiles([{ name: 'a.jpg', type: 'image/jpeg', size: 9 * 1024 * 1024 }], UPLOAD_RULES.roomPhoto), null)
})

test('a partial Serial upload reports X of N and that only the rest will be sent', () => {
  const { describeBatchUpload } = uploads
  assert.equal(describeBatchUpload(5, 5), '5 files uploaded')
  assert.equal(describeBatchUpload(1, 1), '1 file uploaded')
  assert.match(describeBatchUpload(2, 5), /^2 of 5 uploaded\. .*remaining 3 files/)
  assert.match(describeBatchUpload(4, 5), /remaining 1 file\.$/)
  assert.match(describeBatchUpload(0, 3), /Nothing was uploaded.*all 3 files/)
})

function photoLib({ jpegSizes }) {
  const calls = []
  const headshot = {
    PHOTO_CANNOT_OPEN_MESSAGE: 'cannot open',
    looksLikeImage: file => (file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|heic)$/i.test(file.name)),
    photoToJpeg: async (_file, maxSide) => { calls.push(maxSide); return { size: jpegSizes.shift(), type: 'image/jpeg' } },
  }
  class FakeFile {
    constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = opts.type; this.size = parts[0].size }
  }
  const lib = loadTs('lib/photo-upload.ts', {
    globals: { File: FakeFile, Date },
    stubs: { '@/lib/headshot-image': headshot, '@/lib/notify': { UserFacingError } },
  })
  return { lib, calls }
}

test('phone photos are shrunk to a JPEG, retried smaller once, then refused plainly', async () => {
  const { jpegFileName } = photoLib({ jpegSizes: [] }).lib
  assert.equal(jpegFileName('IMG_0042.HEIC'), 'IMG_0042.jpg')
  assert.equal(jpegFileName(''), 'photo.jpg')
  assert.equal(jpegFileName('my photo (1).png'), 'my_photo_1.jpg')

  const ok = photoLib({ jpegSizes: [800_000] })
  const file = await ok.lib.preparePhotoForUpload({ name: 'IMG_1.HEIC', type: '', size: 9e6 }, { maxSide: 1600, maxBytes: 4e6 })
  assert.equal(file.type, 'image/jpeg')
  assert.equal(file.name, 'IMG_1.jpg')
  assert.deepEqual(ok.calls, [1600])

  const retry = photoLib({ jpegSizes: [5e6, 2e6] })
  await retry.lib.preparePhotoForUpload({ name: 'big.jpg', type: 'image/jpeg', size: 2e7 }, { maxSide: 1600, maxBytes: 4e6 })
  assert.deepEqual(retry.calls, [1600, 960])

  const tooBig = photoLib({ jpegSizes: [5e6, 5e6] })
  await assert.rejects(tooBig.lib.preparePhotoForUpload({ name: 'x.jpg', type: 'image/jpeg', size: 1 }, { maxBytes: 4e6 }), err => err.userFacing && /too large/.test(err.message))

  const notPhoto = photoLib({ jpegSizes: [] })
  await assert.rejects(notPhoto.lib.preparePhotoForUpload({ name: 'a.pdf', type: 'application/pdf', size: 1 }), err => err.userFacing && err.message === 'cannot open')
})

test('photo uploads shrink in the browser before they reach a bucket or function', () => {
  const papa = fs.readFileSync('components/papas/PapaPhotoStep.tsx', 'utf8')
  assert.ok(papa.indexOf('preparePhotoForUpload') < papa.indexOf("fetch(`/api/papas/"), 'Papa photo must be shrunk before posting')
  assert.match(papa, /accept=\{PHOTO_INPUT_ACCEPT\}/)
  const route = fs.readFileSync('app/api/papas/[id]/photo/route.ts', 'utf8')
  assert.match(route, /UPLOAD_RULES\.functionPhoto/)
  assert.doesNotMatch(route, /heic/)
  const room = fs.readFileSync('components/nests/RoomOperations.tsx', 'utf8')
  const createItem = room.split('const createItem = useMutation')[1].split('onError')[0]
  assert.ok(createItem.indexOf('preparePhotoForUpload') < createItem.indexOf('.upload('))
  assert.match(createItem, /validateUploadFiles\(\[photo\], UPLOAD_RULES\.roomPhoto\)/)
  const vip = fs.readFileSync('components/theatre/VIPManagementPanel.tsx', 'utf8')
  assert.doesNotMatch(vip, /5 \* 1024 \* 1024\) \{\s*toast\.error/)
  assert.ok(vip.indexOf('preparePhotoForUpload') < vip.indexOf(".from('vip-photos')"))
})

test('Serial drops each file once stored so a retry cannot duplicate it', () => {
  const serial = fs.readFileSync('app/(dashboard)/serial/page.tsx', 'utf8')
  const upload = serial.split('const handleUpload = async')[1].split('const statusMutation')[0]
  assert.match(upload, /files: current\.files\.filter\(f => f !== file\)/)
  assert.match(upload, /remove\(\[path\]\)/, 'a failed record must not leave an orphaned file')
  assert.match(serial, /Uploading \$\{/)
})

test('phones: no reload on reconnect, offline saves fail fast, one location tracker', () => {
  const config = fs.readFileSync('next.config.js', 'utf8')
  assert.match(config, /reloadOnOnline: false/)
  const provider = fs.readFileSync('components/providers/QueryProvider.tsx', 'utf8')
  assert.match(provider.split('mutations:')[1] ?? '', /networkMode: 'always'/)
  const map = fs.readFileSync('components/tracking/LiveTrackingMap.tsx', 'utf8')
  assert.doesNotMatch(map, /useLocationTracking|watchPosition|getCurrentPosition/)
  assert.equal(fs.existsSync('hooks/useLocationTracking.ts'), false)
  // Short phones: the map card must not be forced taller than its column.
  assert.doesNotMatch(map, /className="flex-1 p-0 relative min-h-\[360px\]"/)
  const bell = fs.readFileSync('components/notifications/NotificationCenter.tsx', 'utf8')
  assert.doesNotMatch(bell, /100vh-80px/)
  assert.match(bell, /100dvh/)
})

test('incident reports keep their id and text across retries and go to the offline queue', () => {
  const page = fs.readFileSync('app/(dashboard)/incidents/page.tsx', 'utf8')
  assert.match(page, /newReport\.current\.id = crypto\.randomUUID\(\)/)
  assert.match(page, /error\.code !== '23505'/)
  assert.match(page, /offlineQueue\.addToQueue\('incident', record\)/)
  const open = page.split('const openDialog = ')[1].split('if (loading)')[0]
  assert.doesNotMatch(open, /resetForm\(\)/, 'reopening the dialog must not wipe an unsent report')
})

function flattenLib({ jpegSizes = [], bitmap = { width: 3000, height: 1500 }, flatSize = 500_000 } = {}) {
  const calls = { photoToJpeg: [], fills: [], draws: [], closed: 0 }
  const headshot = {
    PHOTO_CANNOT_OPEN_MESSAGE: 'cannot open',
    looksLikeImage: file => file.type.startsWith('image/'),
    photoToJpeg: async (_file, maxSide) => { calls.photoToJpeg.push(maxSide); return { size: jpegSizes.shift(), type: 'image/jpeg' } },
    canvasToBlob: async canvas => ({ size: flatSize, type: 'image/jpeg', width: canvas.width, height: canvas.height }),
  }
  const ctx = {
    fillStyle: null,
    fillRect: (...args) => calls.fills.push({ style: ctx.fillStyle, args }),
    drawImage: (...args) => calls.draws.push({ afterFill: calls.fills.length > 0, args }),
  }
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }
  const createImageBitmap = bitmap
    ? async () => ({ ...bitmap, close: () => { calls.closed += 1 } })
    : async () => { throw new Error('cannot decode') }
  class FakeFile {
    constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = opts.type; this.size = parts[0].size }
  }
  const lib = loadTs('lib/photo-upload.ts', {
    globals: { File: FakeFile, Date, document, createImageBitmap },
    stubs: { '@/lib/headshot-image': headshot, '@/lib/notify': { UserFacingError } },
  })
  return { lib, calls }
}

test('transparent photos keep their transparency or are flattened onto white, never black', async () => {
  // A PNG or WebP that already fits is uploaded as it is.
  const kept = flattenLib()
  const png = { name: 'logo.png', type: 'image/png', size: 200_000 }
  assert.equal(await kept.lib.preparePhotoForUpload(png, { maxBytes: 4e6 }), png)
  const webp = { name: 'cut.webp', type: 'image/webp', size: 200_000 }
  assert.equal(await kept.lib.preparePhotoForUpload(webp, { maxBytes: 4e6 }), webp)
  assert.equal(kept.calls.photoToJpeg.length + kept.calls.draws.length, 0)
  assert.equal(kept.lib.photoExtension(png), 'png')
  assert.equal(kept.lib.photoExtension(webp), 'webp')
  assert.equal(kept.lib.photoExtension({ type: 'image/jpeg' }), 'jpg')

  // An oversized PNG is shrunk to a JPEG with white painted first.
  const big = flattenLib()
  const out = await big.lib.preparePhotoForUpload({ name: 'portrait.png', type: 'image/png', size: 9e6 }, { maxSide: 1600, maxBytes: 4e6 })
  assert.equal(out.type, 'image/jpeg')
  assert.equal(out.name, 'portrait.jpg')
  assert.equal(big.calls.fills.length, 1)
  assert.equal(big.calls.fills[0].style, '#ffffff')
  assert.deepEqual(big.calls.fills[0].args, [0, 0, 1600, 800])
  assert.equal(big.calls.draws[0].afterFill, true)
  assert.equal(big.calls.photoToJpeg.length, 0)
  assert.equal(big.calls.closed, 1)

  // A GIF is flattened too (it may be transparent), even when small.
  const gif = flattenLib()
  await gif.lib.preparePhotoForUpload({ name: 'a.gif', type: 'image/gif', size: 1000 }, { maxBytes: 4e6 })
  assert.equal(gif.calls.fills[0].style, '#ffffff')

  // If the browser cannot decode it that way, the shared converter is used.
  const fallback = flattenLib({ bitmap: null, jpegSizes: [300_000] })
  await fallback.lib.preparePhotoForUpload({ name: 'odd.png', type: 'image/png', size: 9e6 }, { maxSide: 1600, maxBytes: 4e6 })
  assert.deepEqual(fallback.calls.photoToJpeg, [1600])

  // A JPEG still goes through the shared converter (no transparency to keep).
  const jpeg = flattenLib({ jpegSizes: [300_000] })
  await jpeg.lib.preparePhotoForUpload({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }, { maxBytes: 4e6 })
  assert.deepEqual(jpeg.calls.photoToJpeg, [1600])
  assert.equal(jpeg.calls.fills.length, 0)
})

test('kept PNG/WebP photos are stored with their own type and extension', () => {
  for (const file of ['components/theatre/VIPManagementPanel.tsx', 'components/nests/RoomOperations.tsx']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /\$\{photoExtension\(photo\)\}/, file)
    assert.match(source, /contentType: photo\.type/, file)
    assert.doesNotMatch(source, /randomUUID\(\)\}\.jpg/, file)
  }
})

test('the map says "Broadcasting" only when this device\'s own pin is recent', () => {
  const { broadcastStatus, LIVE_FIX_MAX_AGE_MS } = loadTs('lib/location-broadcast.ts', { globals: { Date, Number } })
  const now = Date.parse('2026-11-20T12:00:00Z')
  const recent = new Date(now - 30_000).toISOString()
  const old = new Date(now - LIVE_FIX_MAX_AGE_MS - 1000).toISOString()
  assert.equal(broadcastStatus({ permission: 'granted', ownUpdatedAt: recent, now }), 'live')
  // Safari cannot always report permission; a recent pin is still proof.
  assert.equal(broadcastStatus({ permission: 'unknown', ownUpdatedAt: recent, now }), 'live')
  // iOS waits for a tap: sharing on with permission "prompt" is not broadcasting.
  assert.equal(broadcastStatus({ permission: 'prompt', ownUpdatedAt: null, now }), 'waiting')
  assert.equal(broadcastStatus({ permission: 'unknown', ownUpdatedAt: undefined, now }), 'waiting')
  assert.equal(broadcastStatus({ permission: 'prompt', ownUpdatedAt: old, now }), 'waiting')
  assert.equal(broadcastStatus({ permission: 'granted', ownUpdatedAt: old, now }), 'finding')
  assert.equal(broadcastStatus({ permission: 'granted', ownUpdatedAt: 'not a date', now }), 'finding')
  assert.equal(broadcastStatus({ permission: 'denied', ownUpdatedAt: recent, now }), 'blocked')

  const map = fs.readFileSync('components/tracking/LiveTrackingMap.tsx', 'utf8')
  assert.doesNotMatch(map, /sharingEnabled && permissionStatus !== 'denied'/)
  assert.match(map, /broadcast === 'live' \? \(/)
  assert.match(map, /Waiting for location — tap to allow/)
})
