const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')

function compile(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), ...globals })
  return mod.exports
}

const { describeNotificationForDevice: describe } = compile('lib/notification-route.ts')

test('each kind of notification says what happened and what to do', () => {
  const cases = [
    [{ type: 'broken_arrow' }, /Emergency/, /respond/],
    [{ type: 'info', metadata: { kind: 'mission_request' } }, /Availability request/, /confirm whether you are available/],
    [{ type: 'info', metadata: { kind: 'food_ready' } }, /Food is ready/, /serving point/],
    [{ type: 'chat', metadata: { kind: 'mention' } }, /mentioned/, /read and reply/],
    [{ type: 'warning', metadata: { kind: 'password_reset_request' } }, /Password reset/, /approve or reject/],
    [{ type: 'birthday_reminder' }, /Birthday/, /Welfare/],
    [{ type: 'announcement', metadata: { category: 'Training' } }, /Training announcement/, /Open Training/],
    [{ type: 'announcement', metadata: { category: 'wedding' } }, /Welfare announcement/, /Open Welfare/],
    [{ type: 'announcement' }, /New announcement/, /read it/],
    [{ type: 'info', metadata: { url: '/chat?team=strength' } }, /Chat update/, /read and reply/],
    [{ type: 'chat' }, /Chat update/, /read and reply/],
    [{ type: 'call_sign' }, /call sign/, /Operations Monitor/],
    [{ type: 'info', journey_id: 'journey-1' }, /Journey update/, /review the details and act/],
    [{ type: 'reminder' }, /Reminder/, /what needs doing/],
    [{ type: 'alert' }, /Action needed/, /respond/],
    [{ type: 'info' }, /New update/, /Open TCNP/],
  ]
  const seen = new Set()
  for (const [notice, title, body] of cases) {
    const text = describe({ metadata: null, journey_id: null, ...notice })
    assert.match(text.title, title, JSON.stringify(notice))
    assert.match(text.body, body, JSON.stringify(notice))
    // Fits a lock screen and the worker's own limits.
    assert.ok(text.title.length <= 80 && text.body.length <= 200, text.title)
    seen.add(text.title)
  }
  // Only the last, catch-all case may fall back to the generic wording.
  assert.equal([...cases].filter(([notice]) => describe({ metadata: null, journey_id: null, ...notice }).title === 'New update').length, 1)
  assert.ok(seen.size >= 13)
})

test('an emergency is described as one even when it also carries a journey or a kind', () => {
  assert.match(describe({ type: 'broken_arrow', journey_id: 'j', metadata: { kind: 'mention', url: '/chat?x=1' } }).title, /Emergency/)
})

test('device text never repeats what the notification itself says', () => {
  const secret = { type: 'chat', title: 'Message from Pastor Sensitive', message: 'Meet at the private gate', metadata: { kind: 'mention', sender: 'Officer Sensitive', url: '/chat?papaId=sensitive-papa' }, journey_id: null }
  const text = JSON.stringify(describe(secret))
  for (const word of ['Sensitive', 'private gate', 'sensitive-papa']) assert.equal(text.includes(word), false, word)
})

test('the push worker shows the described text, and falls back when it is missing or malformed', async () => {
  const handlers = {}, shown = []
  const self = { location: { origin: 'https://tcnp.example' }, addEventListener: (type, fn) => handlers[type] = fn, registration: { showNotification: async (title, options) => shown.push({ title, ...options }) }, clients: { matchAll: async () => [] } }
  vm.runInNewContext(fs.readFileSync('public/notification-worker.js', 'utf8'), { self, URL, caches: { open: async () => ({ match: async () => new Response('officer') }) } })
  const push = async extra => { let pending; handlers.push({ data: { json: () => ({ targetUserId: 'officer', notificationId: 'n', url: '/dashboard', tag: 't', ...extra }) }, waitUntil: work => pending = work }); await pending }

  await push({ title: 'Availability request', body: 'Leadership is asking who can serve. Open TCNP and confirm whether you are available.' })
  assert.equal(shown[0].title, 'Availability request')
  assert.match(shown[0].body, /confirm whether you are available/)
  // Described or not, a background push always vibrates.
  assert.deepEqual(Array.from(shown[0].vibrate), [200, 100, 200])

  await push({})
  assert.equal(shown[1].title, 'TCNP')
  assert.match(shown[1].body, /new update/)

  await push({ title: { nested: true }, body: 'x'.repeat(500) })
  assert.equal(shown[2].title, 'TCNP')
  assert.match(shown[2].body, /new update/)
})

test('a notification vibrates whether App sounds are on or off', () => {
  for (const muted of [false, true]) {
    const sounds = [], vibrations = []
    const audioManager = { playChime: tone => { if (!muted) sounds.push(tone) }, vibrate: pattern => vibrations.push(pattern) }
    const feedback = compile('lib/notification-feedback.ts', { '@/lib/audio/AudioManager': { audioManager } }, { window: undefined })
    feedback.playNotificationFeedback('info')
    feedback.playNotificationFeedback('mention')
    assert.equal(sounds.length, muted ? 0 : 2, `sound when muted=${muted}`)
    assert.equal(vibrations.length, 2, `vibration when muted=${muted}`)
  }
})

test('the real audio manager does not tie vibration to the mute switch', () => {
  const source = fs.readFileSync('lib/audio/AudioManager.ts', 'utf8')
  const vibrate = source.slice(source.indexOf('  vibrate(pattern'), source.indexOf('  vibrateEmergency'))
  assert.match(vibrate, /haptic\(pattern\)/)
  assert.equal(/_muted/.test(vibrate), false)
})

test('a foreground reminder gives feedback even where system notifications are not allowed', async () => {
  let feedback = 0, system = 0
  const globals = { window: {}, document: { hidden: false, hasFocus: () => true }, Notification: { permission: 'denied' }, console }
  globals.window.Notification = globals.Notification
  const service = compile('lib/services/notificationService.ts', {
    '@/lib/notification-feedback': { playNotificationFeedback: () => feedback++ },
    '@/lib/services/system-notification': { showSystemNotification: async () => { system++; return true } },
  }, globals)
  const instance = service.notificationService
  await instance.showNotification({ title: 'Departure in 30 minutes', body: 'Review your journey.' })
  assert.equal(feedback, 1)
  assert.equal(system, 0, 'no system notification without permission')
  await instance.showNotification({ title: 'Quiet', body: 'No cue wanted.', silent: true })
  assert.equal(feedback, 1)
})

function worker({ feedback, foreground = false } = {}) {
  const handlers = {}, shown = []
  const store = new Map([['/__tcnp_push_owner__', 'officer']])
  if (feedback !== undefined) store.set('/__tcnp_push_feedback__', typeof feedback === 'string' ? feedback : JSON.stringify(feedback))
  const self = { location: { origin: 'https://tcnp.example' }, addEventListener: (type, fn) => handlers[type] = fn, registration: { showNotification: async (title, options) => shown.push({ title, ...options }) },
    clients: { matchAll: async () => [{ url: 'https://tcnp.example/chat', focused: foreground, visibilityState: foreground ? 'visible' : 'hidden', postMessage() {} }] } }
  vm.runInNewContext(fs.readFileSync('public/notification-worker.js', 'utf8'), { self, URL, caches: { open: async () => ({ match: async key => store.has(key) ? new Response(store.get(key)) : undefined }) } })
  const push = async extra => { let pending; handlers.push({ data: { json: () => ({ targetUserId: 'officer', notificationId: 'n', url: '/dashboard', tag: 't', ...extra }) }, waitUntil: work => pending = work }); await pending; return shown[shown.length - 1] }
  return { push }
}

test('with TCNP closed the device alerts as long as vibration or sound is chosen in the app', async () => {
  // Nothing saved yet (a device connected before this existed): alert.
  let shown = await worker().push()
  assert.equal(shown.silent, false); assert.deepEqual(Array.from(shown.vibrate), [200, 100, 200])

  shown = await worker({ feedback: { vibration: true, sound: true } }).push()
  assert.equal(shown.silent, false); assert.deepEqual(Array.from(shown.vibrate), [200, 100, 200])

  // Vibration only: still buzzes with the app closed.
  shown = await worker({ feedback: { vibration: true, sound: false } }).push()
  assert.equal(shown.silent, false); assert.deepEqual(Array.from(shown.vibrate), [200, 100, 200])

  // Sound only: rings, and no vibration pattern is forced on the device.
  shown = await worker({ feedback: { vibration: false, sound: true } }).push()
  assert.equal(shown.silent, false); assert.equal('vibrate' in shown, false)

  // Both switched off: delivered to the tray without disturbing anyone.
  shown = await worker({ feedback: { vibration: false, sound: false } }).push()
  assert.equal(shown.silent, true); assert.equal('vibrate' in shown, false)
})

test('an emergency alerts even when both switches are off, and unreadable settings fail towards alerting', async () => {
  let shown = await worker({ feedback: { vibration: false, sound: false } }).push({ critical: true })
  assert.equal(shown.silent, false); assert.deepEqual(Array.from(shown.vibrate), [200, 100, 200, 100, 400])
  shown = await worker({ feedback: 'not json' }).push()
  assert.equal(shown.silent, false); assert.deepEqual(Array.from(shown.vibrate), [200, 100, 200])
})

test('an open, focused app keeps the system notification quiet and leaves the cue to the page', async () => {
  const shown = await worker({ feedback: { vibration: true, sound: true }, foreground: true }).push()
  assert.equal(shown.silent, true); assert.equal('vibrate' in shown, false)
})

test('the page hands its sound and vibration choices to the worker, and the two agree on the pattern', async () => {
  const written = new Map()
  const push = compile('lib/device-push.ts', {}, { caches: { open: async () => ({ put: async (key, response) => written.set(key, await response.text()) }) }, Response, window: undefined })
  await push.syncPushFeedback({ vibration: false, sound: true })
  assert.deepEqual(JSON.parse(written.get('/__tcnp_push_feedback__')), { vibration: false, sound: true })
  assert.ok(fs.readFileSync('public/notification-worker.js', 'utf8').includes(`[${push.PUSH_VIBRATION.join(', ')}]`))
  // Blocked storage must never break the page.
  const blocked = compile('lib/device-push.ts', {}, { caches: { open: async () => { throw new Error('blocked') } }, Response, window: undefined })
  await blocked.syncPushFeedback({ vibration: true, sound: true })
})

test('operational notifications wake the device immediately; greetings and notices may wait', () => {
  const { pushUrgency } = compile('lib/notification-route.ts')
  const urgency = notice => pushUrgency({ metadata: null, ...notice })
  for (const notice of [{ type: 'broken_arrow' }, { type: 'chat' }, { type: 'chat', metadata: { kind: 'mention' } }, { type: 'info', metadata: { kind: 'mission_request' } }, { type: 'info', metadata: { kind: 'food_ready' } }, { type: 'call_sign' }, { type: 'alert' }, { type: 'reminder' }, { type: 'info', metadata: { url: '/chat?team=a' } }, { type: 'warning', metadata: { kind: 'password_reset_request' } }]) {
    assert.equal(urgency(notice), 'high', JSON.stringify(notice))
  }
  for (const notice of [{ type: 'birthday_reminder' }, { type: 'announcement' }, { type: 'info', metadata: { kind: 'announcement' } }, { type: 'info' }]) {
    assert.equal(urgency(notice), 'normal', JSON.stringify(notice))
  }
})
