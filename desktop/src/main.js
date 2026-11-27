'use strict'

/**
 * TCNP Central for Windows and Mac.
 *
 * A real desktop program: it installs from a file, has its own Start menu /
 * Dock entry and window, and does not depend on which browser is installed.
 * Inside the window it shows TCNP's own screens from APP_URL, so it is always
 * on the current version without reinstalling.
 *
 * Security: the page gets no access to this computer beyond a normal browser
 * tab (no Node, sandboxed, context-isolated), only TCNP's own address is ever
 * loaded in the window, and every other link opens in the default browser.
 */

const { app, BrowserWindow, Menu, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const APP_URL = 'https://tcnp.vercel.app'
const APP_ORIGIN = new URL(APP_URL).origin
const APP_ID = 'com.tcnp.central'
/** `--smoke` loads the app once and exits: used to check a build starts. */
const SMOKE = process.argv.includes('--smoke')
const OFFLINE_PAGE = path.join(__dirname, 'offline.html')
/** What a page from TCNP may ask this computer for. Everything else is refused. */
const ALLOWED_PERMISSIONS = new Set(['notifications', 'media', 'fullscreen', 'clipboard-sanitized-write'])

let mainWindow = null

const isAppUrl = url => { try { return new URL(url).origin === APP_ORIGIN } catch { return false } }
const isOfflinePage = url => url.startsWith('file:') && url.replace(/\\/g, '/').endsWith('/offline.html')
const isSafeExternal = url => /^(https?:|mailto:|tel:)/i.test(url)

function openExternally(url) {
  if (isSafeExternal(url)) void shell.openExternal(url).catch(() => undefined)
}

/* ── Window size and position are remembered between launches ── */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')
function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) return saved
  } catch { /* first launch */ }
  return { width: 1320, height: 860 }
}
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    const bounds = mainWindow.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }))
  } catch { /* not worth interrupting anyone for */ }
}

function createWindow() {
  const state = readWindowState()
  mainWindow = new BrowserWindow({
    x: state.x, y: state.y, width: state.width, height: state.height,
    minWidth: 380, minHeight: 600,
    show: false,
    title: 'TCNP Central',
    backgroundColor: '#05070c',
    autoHideMenuBar: true,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  })
  if (state.maximized) mainWindow.maximize()
  if (!SMOKE) mainWindow.once('ready-to-show', () => mainWindow.show())

  const contents = mainWindow.webContents

  // Only TCNP is ever shown in this window. Anything else goes to the browser.
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url) || isOfflinePage(url)) return
    event.preventDefault()
    openExternally(url)
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) void contents.loadURL(url)
    else openExternally(url)
    return { action: 'deny' }
  })

  // No connection (or TCNP unreachable): a branded page with a retry button.
  contents.on('did-fail-load', (_event, errorCode, _description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* navigation replaced */ || isOfflinePage(validatedUrl)) return
    if (SMOKE) { finishSmoke(false, `load failed (${errorCode})`); return }
    void contents.loadFile(OFFLINE_PAGE)
  })
  // The system can end the page's process to free memory: bring it back.
  contents.on('render-process-gone', () => { if (!mainWindow.isDestroyed()) contents.reload() })
  // Keep the window title as the app's name rather than each page's title.
  mainWindow.on('page-title-updated', event => event.preventDefault())
  mainWindow.on('close', saveWindowState)
  mainWindow.on('closed', () => { mainWindow = null })

  if (SMOKE) contents.once('did-finish-load', () => finishSmoke(true, contents.getURL()))
  void contents.loadURL(APP_URL)
}

function finishSmoke(ok, detail) {
  process.stdout.write(JSON.stringify({ smoke: ok ? 'ok' : 'failed', detail, userAgent: session.defaultSession.getUserAgent() }) + '\n')
  app.exit(ok ? 0 : 1)
}

function buildMenu() {
  const go = direction => () => {
    const history = mainWindow?.webContents.navigationHistory
    if (direction < 0 && history?.canGoBack()) history.goBack()
    if (direction > 0 && history?.canGoForward()) history.goForward()
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'TCNP', submenu: [
      { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => mainWindow?.webContents.loadURL(APP_URL) },
      { label: 'Back', accelerator: 'Alt+Left', click: go(-1) },
      { label: 'Forward', accelerator: 'Alt+Right', click: go(1) },
      { role: 'reload' },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ]))
}

// One copy at a time: opening TCNP again brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // Windows groups notifications and taskbar entries by this id.
    app.setAppUserModelId(APP_ID)

    // The site uses "TCNPApp/" to send a signed-out app to sign-in rather than
    // the public download page, and "TCNPDesktop/" to know it is this program.
    const defaults = session.defaultSession
    defaults.setUserAgent(`${defaults.getUserAgent()} TCNPDesktop/${app.getVersion()} TCNPApp/${app.getVersion()}`)

    const allowed = (origin, permission) => isAppUrl(origin || '') && ALLOWED_PERMISSIONS.has(permission)
    defaults.setPermissionRequestHandler((contents, permission, callback) => callback(allowed(contents.getURL(), permission)))
    defaults.setPermissionCheckHandler((_contents, permission, requestingOrigin) => allowed(requestingOrigin, permission))

    buildMenu()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

    if (SMOKE) setTimeout(() => finishSmoke(false, 'timed out'), 45_000)
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
