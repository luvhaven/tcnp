const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function device({ userAgent, wakeLock = true, refuseLock = false, visibility = 'visible' }) {
  const calls = { lock: 0, released: 0, play: 0, pause: 0, removed: 0 }
  const videos = []
  const document = {
    visibilityState: visibility,
    body: { appendChild: element => videos.push(element) },
    createElement: tag => {
      const listeners = {}
      return tag === 'video'
        ? { tag, style: {}, attributes: {}, children: [], listeners, duration: 1,
            setAttribute(name, value) { this.attributes[name] = value }, appendChild(child) { this.children.push(child) },
            addEventListener(type, fn) { listeners[type] = fn },
            play() { calls.play++; listeners.playing?.(); return Promise.resolve() },
            pause() { calls.pause++; listeners.pause?.() }, remove() { calls.removed++ } }
        : { tag }
    },
  }
  const navigator = { userAgent, maxTouchPoints: 5 }
  if (wakeLock) navigator.wakeLock = { request: async () => { calls.lock++; if (refuseLock) throw new Error('NotAllowedError'); return { released: false, async release() { this.released = true; calls.released++ } } } }
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/keep-awake.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: mod, exports: mod.exports, document, navigator,
    require: name => { assert.equal(name, '@/lib/keep-awake-media'); return { KEEP_AWAKE_MP4: 'data:video/mp4;base64,AAAA', KEEP_AWAKE_WEBM: 'data:video/webm;base64,AAAA' } },
  })
  return { keepAwake: mod.exports.createKeepAwake(), calls, videos, document }
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile'

test('iPhone holds the screen with a playing video as well as the wake lock, which is unreliable there', async () => {
  const d = device({ userAgent: IPHONE })
  d.keepAwake.enable(); await settle()
  assert.equal(d.calls.lock, 1)
  assert.equal(d.calls.play, 1)
  assert.equal(d.videos.length, 1)
  assert.equal(d.videos[0].attributes.playsinline, '', 'must play inline, never full screen')
  assert.doesNotMatch(d.videos[0].style.cssText, /display:\s*none/, 'iPhone ignores hidden media')
  assert.equal(d.keepAwake.isHeld(), true)
  // Safe to call from every tap: nothing is requested twice while held.
  d.keepAwake.enable(); d.keepAwake.enable(); await settle()
  assert.equal(d.calls.lock, 1); assert.equal(d.calls.play, 1)
})

test('an iPhone whose wake lock is refused is still held by the video', async () => {
  const d = device({ userAgent: IPHONE, refuseLock: true })
  d.keepAwake.enable(); await settle()
  assert.equal(d.keepAwake.isHeld(), true)
})

test('a video the system paused (call, app switch) is restarted on the next tap', async () => {
  const d = device({ userAgent: IPHONE })
  d.keepAwake.enable(); await settle()
  d.videos[0].listeners.pause()
  d.keepAwake.enable(); await settle()
  assert.equal(d.calls.play, 2)
})

test('Android uses the wake lock alone and plays no media', async () => {
  const d = device({ userAgent: ANDROID })
  d.keepAwake.enable(); await settle()
  assert.equal(d.calls.lock, 1); assert.equal(d.calls.play, 0); assert.equal(d.videos.length, 0)
  assert.equal(d.keepAwake.isHeld(), true)
})

test('a browser with no Wake Lock API falls back to the video', async () => {
  const d = device({ userAgent: ANDROID, wakeLock: false })
  d.keepAwake.enable(); await settle()
  assert.equal(d.calls.play, 1)
})

test('nothing is requested while the app is in the background, and switching off releases everything', async () => {
  const hidden = device({ userAgent: IPHONE, visibility: 'hidden' })
  hidden.keepAwake.enable(); await settle()
  assert.equal(hidden.calls.lock, 0); assert.equal(hidden.calls.play, 0)

  const d = device({ userAgent: IPHONE })
  d.keepAwake.enable(); await settle()
  d.keepAwake.disable(); await settle()
  assert.equal(d.calls.released, 1); assert.equal(d.calls.pause, 1); assert.equal(d.calls.removed, 1)
  assert.equal(d.keepAwake.isHeld(), false)
})

test('the tracker keeps the screen on, reports each sent position, and offers pocket mode', () => {
  const tracker = fs.readFileSync('components/tracking/LocationTracker.tsx', 'utf8')
  assert.match(tracker, /createKeepAwake\(\)/)
  assert.match(tracker, /addEventListener\('pointerup', hold/)
  assert.match(tracker, /addEventListener\('tcnp-location-sent', sent\)/)
  assert.match(tracker, /<PocketModeScreen /)
  assert.match(fs.readFileSync('lib/location-upload.ts', 'utf8'), /await send\(job\.userId, job\.fix\)\s*\/\/[^\n]*\n\s*if \(typeof window !== 'undefined'\) window\.dispatchEvent\(new Event\('tcnp-location-sent'\)\)/)
  const media = fs.readFileSync('lib/keep-awake-media.ts', 'utf8')
  assert.match(media, /MIT License, Copyright \(c\) Rich Tibbett/)
  assert.match(media, /KEEP_AWAKE_MP4 =\s*"data:video\/mp4;base64,/)
})
