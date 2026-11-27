const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const main = fs.readFileSync('desktop/src/main.js', 'utf8')
const pkg = JSON.parse(fs.readFileSync('desktop/package.json', 'utf8'))

test('the desktop program gives TCNP no more access to the computer than a browser tab', () => {
  assert.match(main, /contextIsolation: true/)
  assert.match(main, /nodeIntegration: false/)
  assert.match(main, /sandbox: true/)
  assert.doesNotMatch(main, /webSecurity: false|allowRunningInsecureContent: true|nodeIntegration: true/)
  assert.doesNotMatch(main, /preload:/, 'no bridge into the page')
  // Only named permissions, and only for TCNP's own address.
  assert.match(main, /new Set\(\['notifications', 'media', 'fullscreen', 'clipboard-sanitized-write'\]\)/)
  assert.match(main, /isAppUrl\(origin \|\| ''\) && ALLOWED_PERMISSIONS\.has\(permission\)/)
})

test('only TCNP loads in the window; every other link goes to the browser', () => {
  assert.match(main, /const APP_URL = 'https:\/\/tcnp\.vercel\.app'/)
  assert.match(main, /contents\.on\('will-navigate', \(event, url\) => \{\s*if \(isAppUrl\(url\) \|\| isOfflinePage\(url\)\) return\s*event\.preventDefault\(\)\s*openExternally\(url\)/)
  assert.match(main, /setWindowOpenHandler\(\(\{ url \}\) => \{[\s\S]*?return \{ action: 'deny' \}/)
  assert.match(main, /const isSafeExternal = url => \/\^\(https\?:\|mailto:\|tel:\)\/i\.test\(url\)/, 'no file: or custom schemes handed to the system')
})

test('it identifies itself so the site sends it to sign-in and hides install prompts', () => {
  assert.match(main, /TCNPDesktop\/\$\{app\.getVersion\(\)\} TCNPApp\/\$\{app\.getVersion\(\)\}/)
  assert.match(main, /app\.requestSingleInstanceLock\(\)/)
  assert.match(main, /app\.setAppUserModelId\(APP_ID\)/)

  const load = userAgent => {
    const mod = { exports: {} }
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/native-shell.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports, navigator: { userAgent } })
    return mod.exports
  }
  assert.equal(load('Mozilla/5.0 Chrome/156 Electron/45 TCNPDesktop/1.0.0 TCNPApp/1.0.0').isDesktopShell(), true)
  assert.equal(load('Mozilla/5.0 (Windows NT 10.0) Chrome/156 Safari/537.36').isDesktopShell(), false)

  const layout = fs.readFileSync('app/(dashboard)/layout.tsx', 'utf8')
  assert.match(layout, /const insideApp = nativeShell \|\| \(isClient && isDesktopShell\(\)\)/)
  assert.match(fs.readFileSync('lib/device-push.ts', 'utf8'), /TCNPDesktop[^\n]*return 'unsupported'/, 'no browser push is attempted where none exists')
})

test('the installer keeps one file name, so the download link never goes stale', () => {
  assert.equal(pkg.build.win.artifactName, 'TCNP-Central-Setup.${ext}')
  assert.equal(pkg.build.appId, 'com.tcnp.central')
  assert.equal(pkg.build.nsis.perMachine, false, 'installs without administrator rights')
  const home = fs.readFileSync('app/page.tsx', 'utf8')
  assert.match(home, /releases\/latest\/download\/TCNP-Central-Setup\.exe/)
  const page = fs.readFileSync('components/landing/LandingPage.tsx', 'utf8')
  assert.match(page, /windows: windowsUrl \|\| null, mac: macUrl \|\| null/)
  assert.match(page, /Windows protected your PC/, 'the unsigned-installer prompt is explained up front')
  // Built files and dependencies stay out of git, the web build and the deploy.
  assert.match(fs.readFileSync('desktop/.gitignore', 'utf8'), /^dist\/$/m)
  assert.match(fs.readFileSync('.vercelignore', 'utf8'), /^desktop$/m)
  assert.match(fs.readFileSync('eslint.config.mjs', 'utf8'), /'desktop\/\*\*'/)
})
