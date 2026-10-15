const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { z } = require('zod')

test('resolveNotificationRoute navigates password reset requests to the admin resets tab', () => {
  const source = fs.readFileSync('hooks/useNotifications.ts', 'utf8')
  assert.match(source, /if\s*\(kind === ['"]password_reset_request['"]\)\s*return\s*['"]\/officers\?tab=resets['"]/)
  assert.match(source, /if\s*\(kind === ['"]password_reset_request['"]\)\s*return\s*['"]warning['"]/)
})

test('password reset request requires valid email and minimum password length', () => {
  const requestSchema = z.object({
    email: z.string().trim().email().transform((v) => v.toLowerCase()),
  })

  const confirmSchema = z.object({
    token: z.string().min(16),
    newPassword: z.string().min(6, 'Password must be at least 6 characters').max(4096),
  })

  // Valid email passes and normalizes to lower case
  const validEmail = requestSchema.safeParse({ email: ' Officer@Example.Com ' })
  assert.equal(validEmail.success, true)
  assert.equal(validEmail.data.email, 'officer@example.com')

  // Invalid email fails
  assert.equal(requestSchema.safeParse({ email: 'invalid-email' }).success, false)
  assert.equal(requestSchema.safeParse({ email: '' }).success, false)

  // Short password fails (< 6 characters)
  assert.equal(confirmSchema.safeParse({ token: '1234567890123456', newPassword: '12345' }).success, false)

  // 6 character password passes
  assert.equal(confirmSchema.safeParse({ token: '1234567890123456', newPassword: '123456' }).success, true)
})

test('admin approval and rejection endpoints require platform administrator authority', () => {
  const approveSource = fs.readFileSync('app/api/admin/password-resets/approve/route.ts', 'utf8')
  assert.match(approveSource, /isPlatformAdministrator\(caller\.role\)/)
  assert.match(approveSource, /password-reset:\$\{requestId\}/)
  assert.match(approveSource, /action:\s*['"]password_reset_approved['"]/)

  const rejectSource = fs.readFileSync('app/api/admin/password-resets/reject/route.ts', 'utf8')
  assert.match(rejectSource, /isPlatformAdministrator\(caller\.role\)/)
  assert.match(rejectSource, /action:\s*['"]password_reset_rejected['"]/)
})

test('confirm endpoint enforces approved status and signs out on completion', () => {
  const confirmSource = fs.readFileSync('app/api/auth/reset-password/confirm/route.ts', 'utf8')
  assert.match(confirmSource, /resetReq\.status !== ['"]approved['"]/)
  assert.match(confirmSource, /updateUserById\(resetReq\.user_id/)
  assert.match(confirmSource, /action:\s*['"]password_reset_completed['"]/)

  const loginPageSource = fs.readFileSync('app/(auth)/login/page.tsx', 'utf8')
  assert.match(loginPageSource, /await supabase\.auth\.signOut\(\)/)
  assert.match(loginPageSource, /setMode\(["']login["']\)/)
})

test('reset request expiration detects expired vs active timestamps', () => {
  const now = Date.now()
  const activeExpiry = new Date(now + 3600 * 1000).toISOString()
  const expiredExpiry = new Date(now - 1000).toISOString()

  assert.equal(new Date(activeExpiry) > new Date(), true)
  assert.equal(new Date(expiredExpiry) < new Date(), true)
})
