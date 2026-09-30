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

test('public signup always creates a pending Viewer request regardless of submitted role', () => {
  const source = fs.readFileSync('app/api/auth/signup/route.ts', 'utf8')
  assert.match(source, /const \{ email, password, full_name, phone, oscar: custom_oscar, team \} = body/)
  assert.match(source, /const role = 'viewer'/)
  assert.match(source, /activation_status: 'pending'/)
  assert.match(source, /is_active: false/)
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

test('dashboard global-sensitive view is limited to Command/Admin and rejected missions are excluded', () => {
  const source = fs.readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8')
  assert.match(source, /canViewGlobalDashboard = useMemo[\s\S]*?canAccessCommandCentre\(currentUser\.role, currentUser\.oscar\)/)
  assert.doesNotMatch(source, /import \{[^}]*\bisAdmin\b/)
  assert.match(source, /if \(canViewGlobalDashboard\) \{[\s\S]*?setStats\(/)
  assert.match(source, /canViewGlobalDashboard && \(\s*<ErrorBoundary>/)
  assert.match(source, /row\.status === "rejected"/)
  assert.match(source, /myJourneysQuery\.not\("id", "in"/)
  assert.match(source, /select\(canViewGlobalDashboard \? "id, name" : "id"\)/)
})

test('dialogs escape clipped page containers and respect the dynamic viewport', () => {
  const dialog = fs.readFileSync('components/ui/dialog.tsx', 'utf8')
  const profile = fs.readFileSync('components/officers/OfficerProfileDialog.tsx', 'utf8')
  const directory = fs.readFileSync('components/welfare/WelfareOfficerDirectory.tsx', 'utf8')
  assert.match(dialog, /createPortal\([\s\S]*?document\.body/)
  assert.match(dialog, /max-h-\[calc\(100dvh-/)
  assert.match(dialog, /overflow-y-auto overscroll-contain/)
  assert.match(profile, /max-h-\[calc\(100dvh-/)
  assert.match(profile, /min-h-0 flex-1[\s\S]*?overflow-y-auto/)
  assert.match(profile, /grid-cols-2 sm:grid-cols-4/)
  assert.match(directory, /role="button"[\s\S]*?event\.key === "Enter" \|\| event\.key === " "/)
  assert.match(directory, /aria-label=\{`View \$\{o\.full_name/)
})

test('Victor access directory reserves card space for actions and supports keyboard activation', () => {
  const source = fs.readFileSync('components/theatre/VIPManagementPanel.tsx', 'utf8')
  assert.match(source, /pr-20 sm:pr-24/)
  assert.match(source, /aria-label=\{`Edit access for \$\{vip\.full_name\}`\}/)
  assert.match(source, /aria-label=\{`Remove access for \$\{vip\.full_name\}`\}/)
  assert.match(source, /<button[\s\S]*?aria-label=\{`View access details for \$\{vip\.full_name\}`\}/)
  assert.match(source, /select\('id, name, status, created_at'\)/)
  assert.match(source, /staleTime: 5 \* 60_000/)
  assert.match(source, /queryKey: \['victor', 'vip-access', effectiveProgramId, theatreId\]/)
})

test('Victor page briefings only request role-visible Papa fields and do not refetch auth serially', () => {
  const source = fs.readFileSync('components/papas/PapaBriefingsSection.tsx', 'utf8')
  assert.match(source, /\.map\(\(field\) => field\.key\)/)
  assert.match(source, /\.select\(papaFields\.join\(', '\)\)/)
  assert.match(source, /queryKey: \['papa-briefings', providedUserId \|\| 'session-user', role\]/)
  assert.doesNotMatch(source, /passport_number/)
  assert.match(source, /if \(!userId\) \{/)
})
