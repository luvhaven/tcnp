const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadProxy() {
  const mod = { exports: {} }
  const NextResponse = { next: () => ({ kind: 'next' }), redirect: url => ({ kind: 'redirect', to: new URL(url).pathname + new URL(url).search }) }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('proxy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: mod, exports: mod.exports, URL, require: name => { assert.equal(name, 'next/server'); return { NextResponse } },
  })
  return mod.exports.proxy
}
const request = (path, { cookie = false, userAgent = 'Mozilla/5.0 Chrome/130' } = {}) => ({
  url: `https://tcnp.example${path}`,
  nextUrl: { pathname: path.split('?')[0], search: path.includes('?') ? '?' + path.split('?')[1] : '' },
  headers: { get: name => name.toLowerCase() === 'user-agent' ? userAgent : null },
  cookies: { getAll: () => cookie ? [{ name: 'sb-abc123-auth-token', value: 'x' }] : [] },
})

test('the home address is the public download page for visitors and the dashboard for signed-in officers', () => {
  const proxy = loadProxy()
  assert.deepEqual(proxy(request('/')), { kind: 'next' }, 'a visitor sees the download page')
  assert.deepEqual(proxy(request('/', { cookie: true })), { kind: 'redirect', to: '/dashboard' })
  // The native app opens the home address signed out: it gets sign-in, not a brochure.
  assert.deepEqual(proxy(request('/', { userAgent: 'Mozilla/5.0 (Linux; Android 14) TCNPApp/1.0.0' })), { kind: 'redirect', to: '/login' })
})

test('every other page is guarded exactly as before', () => {
  const proxy = loadProxy()
  assert.deepEqual(proxy(request('/login')), { kind: 'next' })
  assert.deepEqual(proxy(request('/install')), { kind: 'next' })
  assert.deepEqual(proxy(request('/dashboard')), { kind: 'redirect', to: '/login?next=%2Fdashboard' })
  assert.deepEqual(proxy(request('/chat?team=a')), { kind: 'redirect', to: '/login?next=%2Fchat%3Fteam%3Da' })
  assert.deepEqual(proxy(request('/dashboard', { cookie: true })), { kind: 'next' })
})

test('installed apps skip the download page, and download links are only ever https', () => {
  const page = fs.readFileSync('components/landing/LandingPage.tsx', 'utf8')
  assert.match(page, /if \(isInstalled \|\| isNativeShell\(\) \|\| isDesktopShell\(\)\) router\.replace\('\/login'\)/)
  assert.doesNotMatch(page, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/, 'no stray control characters')
  // The web app stays on offer even when native downloads exist: its install
  // never consults the native links.
  const installWeb = page.slice(page.indexOf('const installWeb = async'), page.indexOf('const heroLabel'))
  assert.match(installWeb, /await install\(\)/)
  assert.doesNotMatch(installWeb, /native\[/)
  assert.match(page, /id="web-app"[\s\S]*?Install web app[\s\S]*?Open in browser/)
  const home = fs.readFileSync('app/page.tsx', 'utf8')
  assert.match(home, /if \(user\) redirect\('\/dashboard'\)/)
  assert.ok(home.includes('.test(value) ? value : null') && home.includes('^https:'), 'only https links are offered')
  assert.doesNotMatch(fs.readFileSync('proxy.ts', 'utf8'), /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/)
  // The showcase styles cannot leak into the signed-in app.
  const css = fs.readFileSync('app/landing.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const selector of css.match(/^[^@{}\s][^{}]*(?=\{)/gm) || []) {
    if (/^(from|to|\d+%)/.test(selector.trim())) continue
    assert.match(selector, /\.landing/, selector.trim())
  }
})

test('the Android card downloads the real app, published beside the Windows installer', () => {
  const home = fs.readFileSync('app/page.tsx', 'utf8')
  // "releases/latest" serves one release, so both downloads share it.
  assert.match(home, /releases\/latest\/download\/TCNP-Central\.apk/)
  assert.match(home, /releases\/latest\/download\/TCNP-Central-Setup\.exe/)
  assert.match(home, /androidUrl=\{downloadLink\(process\.env\.NEXT_PUBLIC_ANDROID_APP_URL\) \?\? ANDROID_APP\}/)
  const page = fs.readFileSync('components/landing/LandingPage.tsx', 'utf8')
  assert.match(page, /note: native\.android \? '[^']*allow your browser to install apps[^']*keep the web app/, 'the install prompt and the missing closed-app alerts are stated up front')

  // The phone build produces an installable .apk and sends Expo only mobile/.
  const eas = JSON.parse(fs.readFileSync('mobile/eas.json', 'utf8'))
  assert.equal(eas.build.preview.android.buildType, 'apk')
  const ignore = fs.readFileSync('.easignore', 'utf8').split(/\r?\n/)
  assert.ok(ignore.includes('/*') && ignore.includes('!/mobile'), 'nothing outside mobile/ is uploaded')
  assert.ok(ignore.includes('.env*') && ignore.includes('node_modules/'))
})

test('a device that already has TCNP is offered "Open TCNP", not told to install it by hand', async () => {
  const load = navigator => {
    const mod = { exports: {} }
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pwa-install.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports, navigator })
    return mod.exports.isInstalledOnThisDevice
  }
  assert.equal(await load({ getInstalledRelatedApps: async () => [{ platform: 'webapp', url: 'https://tcnp.vercel.app/manifest.json' }] })(), true)
  assert.equal(await load({ getInstalledRelatedApps: async () => [] })(), false)
  assert.equal(await load({})(), false, 'browsers without the check report "not known" as not installed')
  assert.equal(await load({ getInstalledRelatedApps: async () => { throw new Error('blocked') } })(), false)

  // The browser only answers the check for an app the manifest names.
  const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'))
  assert.deepEqual(manifest.related_applications, [{ platform: 'webapp', url: 'https://tcnp.vercel.app/manifest.json' }])
  assert.equal(manifest.prefer_related_applications, false, 'the browser must still offer its own install dialog')

  const page = fs.readFileSync('components/landing/LandingPage.tsx', 'utf8')
  assert.match(page, /isInstalledOnThisDevice\(\)\.then\(installed => \{ if \(live && installed\) setHasApp\(true\) \}\)/)
  assert.match(page, /if \(hasApp\) \{ router\.push\('\/login'\); return \}/)
  assert.match(page, /hasApp \? 'Open TCNP' : 'Install web app'/)
})
