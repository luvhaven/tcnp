const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('Tailwind config remains loadable in the Next.js ESM development process', () => {
  const source = fs.readFileSync('tailwind.config.ts', 'utf8')
  assert.match(source, /import tailwindcssAnimate from ['"]tailwindcss-animate['"]/)
  assert.doesNotMatch(source, /require\(['"]tailwindcss-animate['"]\)/)
})

test('sidebar uses the same current-user profile source as the header', () => {
  const source = fs.readFileSync('components/layout/sidebar.tsx', 'utf8')
  assert.match(source, /useCurrentUser\(\)/)
  assert.doesNotMatch(source, /\.select\(['"]role, oscar['"]\)/)
})

test('chat composer and actions have an accessible keyboard path', () => {
  const source = fs.readFileSync('components/chat/ChatSystem.tsx', 'utf8')
  assert.match(source, /aria-label="Message the team"/)
  assert.match(source, /aria-label=\{editingMessage \? 'Save edited message' : 'Send message'\}/)
  assert.match(source, /event\.key === 'Enter' && !event\.shiftKey/)
  assert.match(source, /textareaRef\.current\.setSelectionRange/)
  assert.doesNotMatch(source, /inputRef\.current/)
})

test('critical alert animation has a valid keyframe definition', () => {
  const source = fs.readFileSync('app/globals.css', 'utf8')
  assert.match(source, /@keyframes pulse-slow/)
  assert.doesNotMatch(source, /^pulse-slow tokens$/m)
  assert.doesNotMatch(source, /^user-select$/m)
})

test('officer directory service-role reads require an active platform administrator', () => {
  const source = fs.readFileSync('app/api/officers/list/route.ts', 'utf8')
  const guard = source.indexOf('!isPlatformAdministrator(caller.role)')
  const serviceRead = source.indexOf('const adminClient = createAdminClient()')
  assert.ok(guard >= 0 && serviceRead > guard)
  assert.match(source, /caller\.activation_status !== 'active'/)
  assert.match(source, /caller\.is_active === false/)
})

test('officer full-profile endpoint limits access to self or approved profile viewers', () => {
  const source = fs.readFileSync('app/api/officers/[id]/details/route.ts', 'utf8')
  const guard = source.indexOf('user.id !== id && !canViewOfficerFullProfile')
  const serviceRead = source.indexOf('const adminClient = createAdminClient()')
  assert.ok(guard >= 0 && serviceRead > guard)
  assert.match(source, /caller\.activation_status !== 'active'/)
})

test('program officer roster is restricted to journey managers or program participants', () => {
  const source = fs.readFileSync('app/api/officers/by-program/route.ts', 'utf8')
  assert.match(source, /if \(!isAdmin\(caller\.role\)\)/)
  assert.match(source, /current_title_assignments[\s\S]*?user\.id/)
  assert.match(source, /mission_responses[\s\S]*?user\.id/)
  assert.match(source, /You are not assigned to this program/)
})

test('Command flight watch is active-account and Command/Admin gated', () => {
  const source = fs.readFileSync('app/api/flights/watch/route.ts', 'utf8')
  assert.match(source, /supabase\.auth\.getUser\(\)/)
  assert.match(source, /caller\.activation_status !== 'active'/)
  assert.match(source, /canAccessCommandCentre\(caller\.role, caller\.oscar\)/)
  assert.match(source, /Cache-Control': 'private, no-store'/)
})

test('OpenSky polling defaults to its anonymous free quota and supports OAuth refresh', () => {
  const source = fs.readFileSync('app/api/flights/watch/route.ts', 'utf8')
  assert.match(source, /ANONYMOUS_REFRESH_SECONDS = 15 \* 60/)
  assert.match(source, /AUTHENTICATED_REFRESH_SECONDS = 2 \* 60/)
  assert.match(source, /OPENSKY_CLIENT_ID/)
  assert.match(source, /OPENSKY_CLIENT_SECRET/)
})
