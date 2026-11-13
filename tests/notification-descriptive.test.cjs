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
  assert.deepEqual(Array.from(shown[0].vibrate), [45, 70, 90])

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
