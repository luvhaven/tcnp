const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const app = fs.readFileSync('mobile/App.tsx', 'utf8')

test('iPhone-only web view settings never reach the Android view', () => {
  // The first Android build closed on launch: decelerationRate="normal" is
  // converted to a number on iPhone only, and Android's native view received
  // the word where it requires a number.
  const start = app.search(/<WebView\s+key=/)
  const view = app.slice(start, app.indexOf('/>', start))
  for (const setting of ['decelerationRate', 'bounces', 'contentInsetAdjustmentBehavior', 'allowsBackForwardNavigationGestures', 'allowsInlineMediaPlayback', 'pullToRefreshEnabled']) {
    assert.doesNotMatch(view, new RegExp(`\\b${setting}\\b`), `${setting} must be passed through IOS_ONLY`)
  }
  assert.match(view, /\{\.\.\.IOS_ONLY\}/)
  assert.match(app, /const IOS_ONLY: Partial<WebViewProps> = Platform\.OS === 'ios' \? \{[\s\S]*?decelerationRate: 'normal',[\s\S]*?\} : \{\}/)
})

test('a failure while starting is shown on screen, and the guard loads before anything else', () => {
  const entry = fs.readFileSync('mobile/index.ts', 'utf8')
  const imports = entry.match(/^import .*$/gm)
  assert.equal(imports[0], "import './src/crash-guard'")
  assert.equal(imports[1], "import './src/location'", 'the background task is still registered before any screen')
  const guard = fs.readFileSync('mobile/src/crash-guard.ts', 'utf8')
  assert.match(guard, /setGlobalHandler/)
  assert.match(guard, /if \(!isFatal\) \{ previous\(error, isFatal\); return \}/, 'ordinary errors are handled as before')
})

test('every Android build can install over the last one', () => {
  const config = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8')).expo
  assert.ok(config.android.versionCode >= 2)
  assert.equal(config.android.package, 'com.tcnp.central')
  assert.equal(config.owner, 'tcnpjourney', 'builds stay on the account that holds the signing key')
})

test('inside the phone app the screen edges are reserved once, by the app', () => {
  const vm = require('node:vm')
  const ts = require('typescript')
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/native-bootstrap.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports })
  const run = (userAgent, extra = {}) => {
    const attrs = {}
    const vars = {}
    const window = { ...extra }
    vm.runInNewContext(mod.exports.NATIVE_BOOTSTRAP_SCRIPT, {
      window, navigator: { userAgent },
      document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v }, style: { setProperty: (k, v) => { vars[k] = v } } } },
    })
    return { native: 'data-tcnp-native' in attrs, vars }
  }
  assert.equal(run('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile TCNPApp/1.0.2').native, true)
  assert.equal(run('Mozilla/5.0 Chrome/130', { ReactNativeWebView: { postMessage() {} } }).native, true)
  assert.equal(run('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile').native, false, 'an ordinary phone browser keeps its own safe areas')
  assert.equal(run('Mozilla/5.0 Chrome/156 Electron/45 TCNPDesktop/1.0.0 TCNPApp/1.0.0').native, false, 'the desktop program has no phone edges')
  assert.deepEqual(run('x TCNPApp/1.0.2', { __TCNP_NATIVE__: { insets: { top: 0, bottom: 24 } } }).vars, { '--native-safe-top': '0px', '--native-safe-bottom': '24px' })
  assert.deepEqual(run('x TCNPApp/1.0.2', { __TCNP_NATIVE__: { insets: { bottom: 'calc(1px);x' } } }).vars, {}, 'only plain numbers become spacing')

  // One variable decides the spacing; nothing reads the browser's value directly.
  const css = fs.readFileSync('app/globals.css', 'utf8')
  assert.match(css, /html\[data-tcnp-native\] \{\s*--safe-top: var\(--native-safe-top, 0px\);\s*--safe-bottom: var\(--native-safe-bottom, 0px\);/)
  assert.equal((css.match(/env\(safe-area-inset-(top|bottom)/g) || []).length, 2, 'only the two definitions read the browser value')
  for (const file of ['components/operations/DistressButton.tsx', 'components/notifications/NotificationCenter.tsx', 'components/providers/SafeProviders.tsx', 'app/(dashboard)/profile/page.tsx']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /env\(safe-area-inset-(top|bottom)/, file)
  }
  assert.match(fs.readFileSync('app/layout.tsx', 'utf8'), /<InlineScript html=\{NATIVE_BOOTSTRAP_SCRIPT\} \/>/)

  // The app runs the page to the bottom edge and supplies the figure.
  assert.match(app, /edges=\{\['top', 'left', 'right'\]\}/)
  assert.match(app, /injectedJavaScriptBeforeContentLoaded=\{insetScript\(insets\.bottom\)\}/)
  assert.match(app, /setProperty\('--native-safe-bottom'/)
})

test('inside the app Back closes what is open first, and exports reach the share sheet', () => {
  const shell = fs.readFileSync('lib/native-shell.ts', 'utf8')
  assert.match(shell, /if \(document\.querySelector\(OPEN_OVERLAY\)\) \{[\s\S]*?key: 'Escape'[\s\S]*?return\s*\}\s*if \(canGoBack\) window\.history\.back\(\)\s*else postToNative\(\{ type: 'app:exit' \}\)/)
  assert.match(app, /window\.__tcnpNativeBack\(\$\{can\}\)/)
  assert.match(app, /if \(message\.type === 'app:exit'\) \{ BackHandler\.exitApp\(\); return \}/)

  // No screen saves a file on its own: a blob "download" does nothing in the app.
  const save = fs.readFileSync('lib/save-file.ts', 'utf8')
  assert.match(save, /if \(isNativeShell\(\)\) \{[\s\S]*?requestNative\('file:save'/)
  for (const file of ['app/(dashboard)/incidents/page.tsx', 'app/(dashboard)/after-op-reports/page.tsx', 'app/(dashboard)/officers/OfficersClient.tsx', 'components/operations/JourneyStatusTable.tsx', 'components/programs/ProgramExport.tsx', 'components/chat/AdminChatControls.tsx', 'components/dashboard/OfficerStatusReportButton.tsx']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /saveFile\(/, file)
    assert.doesNotMatch(source, /\.download = |setAttribute\('download'|doc\.save\(/, file)
  }
  // The app only ever writes a plain file name into its own cache folder.
  const files = fs.readFileSync('mobile/src/files.ts', 'utf8')
  assert.match(files, /replace\(SAFE_NAME, '_'\)\.replace\(\/\^\\.\+\/, ''\)/)
  assert.match(files, /new File\(Paths\.cache, cleaned\)/)
})

test('phone dialogs are bottom sheets and small controls get a thumb-sized floor', () => {
  const dialog = fs.readFileSync('components/ui/dialog.tsx', 'utf8')
  assert.match(dialog, /flex items-end justify-center[^"]*sm:items-center/)
  assert.match(dialog, /max-sm:rounded-t-2xl[^"]*max-sm:pb-\[calc\(1rem\+var\(--safe-bottom\)\)\]/)
  const css = fs.readFileSync('app/globals.css', 'utf8')
  assert.match(css, /@media \(pointer: coarse\) and \(max-width: 639px\) \{[\s\S]*?min-height: 2\.75rem;/)
  assert.match(css, /@media \(hover: hover\) \{\s*\.card-hover:hover/)
})

test('chat and the live map take the whole phone screen above the tab bar', () => {
  const layout = fs.readFileSync('app/(dashboard)/layout.tsx', 'utf8')
  const immersive = new RegExp(layout.match(/const immersive = \/(.+)\/\.test\(pathname\)/)[1])
  for (const path of ['/chat', '/tracking/live']) assert.equal(immersive.test(path), true, path)
  for (const path of ['/dashboard', '/chatter', '/tracking', '/incidents']) assert.equal(immersive.test(path), false, path)
  assert.match(layout, /data-immersive=\{immersive \? "" : undefined\}/)
  const css = fs.readFileSync('app/globals.css', 'utf8')
  assert.match(css, /@media \(max-width: 859px\) \{\s*\[data-immersive\] \.app-header \{\s*display: none;/, 'phones only: desktop keeps its header')
  assert.match(fs.readFileSync('app/(dashboard)/chat/page.tsx', 'utf8'), /<div className="hidden items-center gap-3 nav:flex">/)

  // Dashboard and My Ops keep scrolling normally but lose the header and title block.
  const headerless = new RegExp(layout.match(/const headerless = \/(.+)\/\.test\(pathname\)/)[1])
  for (const path of ['/dashboard', '/my-operations']) assert.equal(headerless.test(path), true, path)
  for (const path of ['/incidents', '/my-operations-x', '/chat']) assert.equal(headerless.test(path), false, path)
  assert.match(css, /\[data-headerless\] \.page-header-title \{[^}]*clip-path: inset\(50%\)/, 'hidden from sight, still read aloud')
  assert.match(fs.readFileSync('components/ui/page-header.tsx', 'utf8'), /className="page-header-title /)
})
