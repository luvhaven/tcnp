const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadTs(path) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports: mod.exports, module: mod, require })
  return mod.exports
}

const { getClientIp } = loadTs('lib/security/rate-limit.ts')
const { validateUploadFiles, UPLOAD_RULES } = loadTs('lib/security/upload-validation.ts')
const { oscarToRole, SIGNUP_OSCAR_OPTIONS } = loadTs('lib/utils.ts')

test('rate limiter keys on the platform IP, not a client-supplied forwarded-for', () => {
  assert.equal(getClientIp(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' })), '203.0.113.7')
  // Without x-real-ip, use the hop the nearest proxy appended (the last one).
  assert.equal(getClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 198.51.100.2' })), '198.51.100.2')
  assert.equal(getClientIp(new Headers()), '127.0.0.1')
})

test('upload validation rejects wrong types and oversize files', () => {
  const ok = { name: 'a.jpg', type: 'image/jpeg', size: 1024 }
  assert.equal(validateUploadFiles([ok], UPLOAD_RULES.image), null)
  assert.match(validateUploadFiles([{ name: 'x.html', type: 'text/html', size: 10 }], UPLOAD_RULES.image), /not a supported/)
  assert.match(validateUploadFiles([{ name: 'x.svg', type: 'image/svg+xml', size: 10 }], UPLOAD_RULES.image), /not a supported/)
  assert.match(validateUploadFiles([{ name: 'big.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 }], UPLOAD_RULES.image), /larger than 10 MB/)
  assert.equal(validateUploadFiles([{ name: 'v.mp4', type: 'video/mp4', size: 50 * 1024 * 1024 }], UPLOAD_RULES.media), null)
  assert.equal(validateUploadFiles([{ name: 'r.pdf', type: 'application/pdf', size: 1024 }], UPLOAD_RULES.financeDocument), null)
  assert.match(validateUploadFiles([{ name: 'r.exe', type: 'application/x-msdownload', size: 1024 }], UPLOAD_RULES.financeDocument), /not a supported/)
})

test('oscarToRole never yields platform or leadership roles from free text', () => {
  for (const value of ['super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain', 'evil_admin', 'x_captain_y', 'random_oscar']) {
    assert.equal(oscarToRole(value), null, value)
  }
  assert.equal(oscarToRole('head_victor_oscar'), 'head_victor_oscar')
  assert.equal(oscarToRole('Tango Oscar'), 'tango_oscar')
  assert.equal(oscarToRole('November (Nest)'), 'noscar_nest')
})

test('every signup unit option resolves to a known unit', () => {
  for (const option of SIGNUP_OSCAR_OPTIONS) assert.notEqual(oscarToRole(option), null, option)
  const loginPage = fs.readFileSync('app/(auth)/login/page.tsx', 'utf8')
  for (const option of SIGNUP_OSCAR_OPTIONS) assert.ok(loginPage.includes(`value: "${option}"`), option)
})

test('admin chat archive and delete-all require platform administrators', () => {
  const source = fs.readFileSync('app/api/admin/chat/route.ts', 'utf8')
  assert.match(source, /!messageId && !programId && !team && !isPlatformAdministrator\(callerData\.role\)/)
  assert.match(source, /action === 'archive'\) \{\s*if \(!isPlatformAdministrator\(callerData\.role\)\)/)
})

test('bulk-assign never reactivates deactivated officers', () => {
  const source = fs.readFileSync('app/api/admin/bulk-assign-program/route.ts', 'utf8')
  assert.match(source, /isPlatformAdministrator\(role\)/)
  assert.match(source, /if \(isProgramActive && isPending\(u\)\)/)
  assert.doesNotMatch(source, /!u\.is_active \|\|/)
})

test('change-password re-authenticates with the current password', () => {
  const source = fs.readFileSync('app/api/auth/change-password/route.ts', 'utf8')
  assert.match(source, /current_password/)
  assert.match(source, /signInWithPassword\(/)
  assert.doesNotMatch(source, /error: updateError\.message/)
})

test('the browser no longer inserts notifications for other users', () => {
  const chat = fs.readFileSync('components/chat/ChatSystem.tsx', 'utf8')
  assert.doesNotMatch(chat, /from\('notifications'\)\s*\.insert/)
  assert.match(chat, /\/api\/chat\/mention-notifications/)
})
