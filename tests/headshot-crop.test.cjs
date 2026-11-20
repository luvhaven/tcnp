const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

// Loads a TypeScript module from the repo the way the bundler would, with the
// browser globals and module stubs the caller supplies.
function makeLoader({ globals, stubs }) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const mod = { exports: {} }
    cache.set(file, mod.exports)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    vm.runInNewContext(source, {
      module: mod, exports: mod.exports, console, Promise, setTimeout, clearTimeout, ...globals,
      require(name) {
        if (stubs[name]) return stubs[name]
        if (name === '@/lib/headshot-image') return load('lib/headshot-image.ts')
        if (name.startsWith('@/components/ui/')) return load(name.replace('@/', '') + '.tsx')
        return require(name)
      },
    })
    cache.set(file, mod.exports)
    return mod.exports
  }
  return load
}

class UserFacingError extends Error {
  constructor(message) { super(message); this.name = 'UserFacingError'; this.userFacing = true }
}
const notifyStub = { UserFacingError }

test('headshot helpers recognise photos and explain upload failures', () => {
  const load = makeLoader({ globals: {}, stubs: { '@/lib/notify': notifyStub } })
  const lib = load('lib/headshot-image.ts')
  assert.equal(lib.looksLikeImage({ type: 'image/jpeg', name: 'a.jpg' }), true)
  // Some pickers give HEIC photos an empty type: the name decides.
  assert.equal(lib.looksLikeImage({ type: '', name: 'IMG_0042.HEIC' }), true)
  assert.equal(lib.looksLikeImage({ type: '', name: 'notes.pdf' }), false)
  assert.equal(lib.looksLikeImage({ type: 'application/pdf', name: 'photo.jpg' }), false)

  assert.match(lib.describeStorageUploadError({ statusCode: '413', message: 'The object exceeded the maximum allowed size' }), /too large/)
  assert.match(lib.describeStorageUploadError({ message: 'mime type image/heic is not supported' }), /JPG or PNG/)
  assert.equal(lib.describeStorageUploadError({ message: 'new row violates row-level security policy' }), null)
  const wrapped = lib.uploadErrorForUser({ statusCode: '413', message: 'Payload too large' })
  assert.equal(wrapped.userFacing, true)
  const raw = { message: 'something else' }
  assert.equal(lib.uploadErrorForUser(raw), raw)
})

test('headshot cropper explains a photo that cannot be opened instead of leaving "Use Photo" disabled', { skip: !JSDOM && 'Install the isolated form DOM runtime; CI installs it automatically.' }, async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] })
  }
  let urlCount = 0
  const revoked = []
  const FakeURL = { createObjectURL: () => `blob:photo-${++urlCount}`, revokeObjectURL: url => revoked.push(url) }
  // jsdom has no canvas; the cropper's draw/encode calls are stubbed per test.
  let toBlobResult = () => new dom.window.Blob(['jpeg'], { type: 'image/jpeg' })
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} })
  dom.window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(toBlobResult()) }
  const bitmap = { decode: async () => { throw new Error('cannot decode') } }

  const React = require('react')
  const { act } = React
  const { createRoot } = require('react-dom/client')
  const load = makeLoader({
    globals: { document, window: dom.window, navigator: dom.window.navigator, URL: FakeURL, createImageBitmap: file => bitmap.decode(file) },
    stubs: {
      '@/lib/notify': notifyStub,
      '@/lib/utils': { cn: require('clsx').clsx },
    },
  })
  const { HeadshotCropDialog } = load('components/profile/HeadshotCropDialog.tsx')
  let root = createRoot(document.getElementById('root'))
  const cropped = []
  let choseAnother = 0

  async function mount(file) {
    await act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(React.createElement(HeadshotCropDialog, {
      file, open: true, onClose() {}, onCropped: blob => cropped.push(blob), onChooseAnother: () => { choseAnother++ },
    })))
  }
  const img = () => document.querySelector('img[alt="Crop preview"]')
  const button = label => [...document.querySelectorAll('button')].find(b => b.textContent.includes(label))
  const alertText = () => document.querySelector('[role="alert"]')?.textContent ?? null
  async function fire(element, type) { await act(async () => { element.dispatchEvent(new dom.window.Event(type)) }) }
  async function settle() { await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
  function setNatural(element, w, h) {
    Object.defineProperty(element, 'naturalWidth', { configurable: true, value: w })
    Object.defineProperty(element, 'naturalHeight', { configurable: true, value: h })
  }

  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })

  await t.test('a photo neither decoder can open shows plain guidance and a way to choose another', async () => {
    bitmap.decode = async () => { throw new Error('HEIC not supported') }
    await mount(new dom.window.File(['heic'], 'IMG_0042.HEIC', { type: 'image/heic' }))
    assert.equal(button('Use Photo').disabled, true)
    assert.match(document.body.textContent, /Opening photo/)
    await fire(img(), 'error')
    await settle()
    assert.equal(alertText()?.includes("This photo can't be opened here. Choose a JPG or PNG, or take a screenshot of the photo and use that."), true)
    assert.equal(img(), null, 'the broken image is no longer shown')
    assert.equal(button('Use Photo').disabled, true)
    await act(async () => button('Choose another photo').click())
    assert.equal(choseAnother, 1)
  })

  await t.test('a photo the second decoder can open is converted and can then be used', async () => {
    bitmap.decode = async () => ({ width: 3000, height: 4000, close() {} })
    toBlobResult = () => new dom.window.Blob(['jpeg'], { type: 'image/jpeg' })
    await mount(new dom.window.File(['heic'], 'IMG_0043.HEIC', { type: 'image/heic' }))
    const firstSrc = img().getAttribute('src')
    await fire(img(), 'error')
    await settle()
    assert.notEqual(img().getAttribute('src'), firstSrc, 'the converted JPEG replaces the original')
    assert.equal(alertText(), null)
    setNatural(img(), 768, 1024)
    await fire(img(), 'load')
    await settle()
    assert.equal(button('Use Photo').disabled, false)
    const before = cropped.length
    await act(async () => button('Use Photo').click())
    await settle()
    assert.equal(cropped.length, before + 1)
  })

  await t.test('a failed export (toBlob gives nothing) is reported, not silently ignored', async () => {
    toBlobResult = () => null
    await mount(new dom.window.File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' }))
    setNatural(img(), 800, 800)
    await fire(img(), 'load')
    await settle()
    const before = cropped.length
    await act(async () => button('Use Photo').click())
    await settle()
    assert.equal(cropped.length, before)
    assert.match(alertText() ?? '', /couldn't be prepared/)
    assert.equal(button('Use Photo').disabled, false, 'the officer can try again')
  })

  await t.test('choosing a new photo clears the previous photo state', async () => {
    toBlobResult = () => new dom.window.Blob(['jpeg'], { type: 'image/jpeg' })
    await mount(new dom.window.File(['jpeg'], 'first.jpg', { type: 'image/jpeg' }))
    setNatural(img(), 800, 800)
    await fire(img(), 'load')
    assert.equal(button('Use Photo').disabled, false)
    await act(async () => root.render(React.createElement(HeadshotCropDialog, {
      file: new dom.window.File(['x'], 'second.jpg', { type: 'image/jpeg' }), open: true, onClose() {}, onCropped() {},
    })))
    assert.equal(button('Use Photo').disabled, true, 'a stale size must not enable Use Photo for an unopened photo')
    assert.ok(revoked.length > 0, 'object URLs of the previous photo are released')
  })
})
