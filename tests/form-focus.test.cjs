const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

test('real React dialog forms preserve typing, selection, keyboard focus and submission', { skip: !JSDOM && 'Install the isolated form DOM runtime; CI installs it automatically.' }, async t => {
  const dom = new JSDOM('<!doctype html><html><body><button id="trigger">Open</button><div id="root"></div></body></html>', { url: 'https://tcnp.example', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] })
  }
  // jsdom has no layout engine. Supply visibility for the dialog's Tab trap;
  // actual rendered visibility and screen-reader behavior need browser QA.
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.hidden || this.type === 'hidden' ? null : this.parentElement } })
  const React = require('react')
  const { act } = React
  const { createRoot } = require('react-dom/client')
  let root = createRoot(document.getElementById('root'))
  const cache = new Map(), writes = [], errors = []
  const programs = [{ id: 'program-1', name: 'Active program', status: 'active' }]
  let vips = []
  let currentUser = null
  const supabase = { from(table) { assert.equal(table, 'theatre_vips'); return {
    insert: async payload => { writes.push({ operation: 'insert', payload }); return {} },
    update: payload => ({ eq: async (_, id) => { writes.push({ operation: 'update', id, payload }); return {} } }),
  } } }
  const div = ({ children, ...props }) => React.createElement('div', props, children)
  const selectStubs = {
    Select: ({ children }) => React.createElement('div', null, children),
    SelectTrigger: ({ children, ...props }) => React.createElement('button', { ...props, type: 'button' }, children),
    SelectValue: ({ placeholder }) => React.createElement('span', null, placeholder),
    SelectContent: div,
    SelectItem: ({ children }) => React.createElement('span', null, children),
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const mod = { exports: {} }
    cache.set(file, mod.exports)
    const overrides = { 'components/ui/dialog.tsx': process.env.FORM_DIALOG_SOURCE, 'app/(dashboard)/profile/page.tsx': process.env.FORM_PROFILE_SOURCE }
    const sourceFile = overrides[file] || file
    const source = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    vm.runInNewContext(source, {
      module: mod, exports: mod.exports, document, window: dom.window, navigator: dom.window.navigator, console,
      require(name) {
        if (name === '@/lib/utils') return { cn: require('clsx').clsx, normalizeOscarLabel: value => value }
        if (name === '@/hooks/useCurrentUser') return { useCurrentUser: () => ({ data: currentUser, isLoading: false }) }
        if (name === '@/lib/profile-completion') return load('lib/profile-completion.ts')
        if (name === '@/components/tracking/LocationSharingControl') return { LocationSharingControl: () => null }
        if (name === '@/components/notifications/DeviceNotificationControl') return { DeviceNotificationControl: () => null }
        if (name === '@/components/profile/CompletionRing') return { CompletionRing: () => null }
        if (name === '@/components/profile/HeadshotCropDialog') return { HeadshotCropDialog: () => null }
        if (name === '@/components/providers/CelebrateProvider') return { useCelebrate: () => () => {} }
        if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
        if (name === 'framer-motion') return { motion: { div: ({ initial: _initial, animate: _animate, children, ...props }) => React.createElement('div', props, children) } }
        if (name === '@/lib/supabase/client') return { createClient: () => supabase }
        if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async () => true }
        if (name === '@/components/ui/select') return selectStubs
        if (name === '@tanstack/react-query') return { useQueryClient: () => ({ invalidateQueries: async () => {} }), useQuery: ({ queryKey }) => ({ data: queryKey[1] === 'vip-programs' ? programs : vips, isLoading: false, isError: false }) }
        if (name === 'sonner') return { toast: { success() {}, error: message => errors.push(message) } }
        if (name === '@/lib/notify') return { notifyError: (_, message) => errors.push(message) }
        if (name === 'next/image') return { __esModule: true, default: ({ fill: _fill, ...props }) => React.createElement('img', props) }
        if (name.startsWith('@/components/ui/')) return load(name.replace('@/', '') + '.tsx')
        return require(name)
      },
    })
    cache.set(file, mod.exports)
    return mod.exports
  }
  const { Dialog, DialogContent, DialogTitle, DialogDescription } = load('components/ui/dialog.tsx')
  const { Input } = load('components/ui/input.tsx')
  const { Textarea } = load('components/ui/textarea.tsx')
  async function mount(element) {
    await act(async () => root.unmount())
    document.body.style.overflow = ''
    document.getElementById('trigger').focus()
    root = createRoot(document.getElementById('root'))
    await act(async () => root.render(element))
  }
  async function click(button) { assert.ok(button); button.focus(); await act(async () => button.click()) }
  async function enter(control, text) {
    control.focus()
    const proto = control.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set
    for (const char of text) {
      const start = control.selectionStart ?? control.value.length
      const end = control.selectionEnd ?? start
      const value = control.value.slice(0, start) + char + control.value.slice(end)
      await act(async () => {
        setValue.call(control, value)
        control.setSelectionRange(start + char.length, start + char.length)
        control.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      assert.ok(document.activeElement === control, `Focus moved to ${document.activeElement?.tagName}#${document.activeElement?.id} after typing ${JSON.stringify(char)} in ${control.id}`)
      assert.equal(control.selectionStart, start + char.length, 'Typing moved the caret')
    }
  }
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })

  await t.test('inline close callbacks do not restart focus or lose selection as different field types change', async () => {
    function Form() {
      const [open, setOpen] = React.useState(true)
      const [values, setValues] = React.useState({ name: '', notes: '', role: 'officer' })
      return React.createElement(Dialog, { open, onOpenChange: value => setOpen(value) },
        React.createElement(DialogContent, null,
          React.createElement(DialogTitle, null, 'Test form'),
          React.createElement(DialogDescription, null, 'Complete all fields.'),
          React.createElement(Input, { id: 'name', value: values.name, onChange: e => setValues({ ...values, name: e.target.value }) }),
          React.createElement(Textarea, { id: 'notes', value: values.notes, onChange: e => setValues({ ...values, notes: e.target.value }) }),
          React.createElement('select', { id: 'role', value: values.role, onChange: e => setValues({ ...values, role: e.target.value }) }, React.createElement('option', { value: 'officer' }, 'Officer'), React.createElement('option', { value: 'lead' }, 'Lead')),
          React.createElement('button', { type: 'button' }, 'Save')))
    }
    await mount(React.createElement(Form))
    const modal = document.querySelector('[role="dialog"]')
    assert.equal(document.getElementById(modal.getAttribute('aria-labelledby')).textContent, 'Test form')
    assert.equal(document.getElementById(modal.getAttribute('aria-describedby')).textContent, 'Complete all fields.')
    const name = document.getElementById('name'), notes = document.getElementById('notes')
    await enter(name, 'Jane Doe')
    await enter(notes, 'VIP guest\nAccess approved')
    assert.equal(notes.value, 'VIP guest\nAccess approved')
    name.focus(); name.setSelectionRange(5, 8)
    await enter(name, 'Smith')
    assert.equal(name.value, 'Jane Smith')
    const select = document.getElementById('role')
    select.focus()
    await act(async () => { select.value = 'lead'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.ok(document.activeElement === select)
  })
  await t.test('Escape uses the latest close guard without refocusing; Tab stays trapped and close returns to the trigger', async () => {
    const calls = []
    function Form() {
      const [allow, setAllow] = React.useState(false)
      const [open, setOpen] = React.useState(true)
      return React.createElement(Dialog, { open, onOpenChange: value => { calls.push(allow); if (allow) setOpen(value) } },
        React.createElement(DialogContent, null,
          React.createElement(DialogTitle, null, 'Guarded form'),
          React.createElement(Input, { id: 'guarded-name' }),
          React.createElement('button', { id: 'allow', type: 'button', onClick: () => setAllow(true) }, 'Allow close')))
    }
    await mount(React.createElement(Form))
    assert.equal(document.body.style.overflow, 'hidden')
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.ok(document.querySelector('[role="dialog"]'))
    assert.deepEqual(calls, [false])
    await click(document.getElementById('allow'))
    document.getElementById('allow').focus()
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    assert.ok(document.activeElement === document.getElementById('guarded-name'))
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    assert.ok(document.activeElement === document.getElementById('allow'))
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.deepEqual(calls, [false, true])
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement.id, 'trigger')
    assert.equal(document.body.style.overflow, '')
  })
  const VIPManagementPanel = load('components/theatre/VIPManagementPanel.tsx').default
  await t.test('actual Victor Add VIP form accepts complete names, titles, contact and multiline notes and saves them intact', async () => {
    vips = []
    await mount(React.createElement(VIPManagementPanel, { canManage: true, theatreId: 'theatre-1' }))
    const add = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Add VIP')
    await click(add)
    assert.ok(document.querySelector('[role="dialog"]'))
    const values = { full_name: 'Jane Mary Doe', title: 'Senior Minister', organization: 'Example Ministry', contact_info: 'jane@example.test / +234 800 123 4567', notes: 'Seat near the front.\nArriving with two guests.' }
    for (const [id, value] of Object.entries(values)) await enter(document.getElementById(id), value)
    await act(async () => document.querySelector('[role="dialog"] form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(errors.length, 0)
    assert.equal(writes.at(-1).operation, 'insert')
    assert.equal(writes.at(-1).payload[0].program_id, 'program-1')
    assert.equal(writes.at(-1).payload[0].theatre_id, 'theatre-1')
    for (const [id, value] of Object.entries(values)) assert.equal(writes.at(-1).payload[0][id], value)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.ok(document.activeElement === add)
  })
  await t.test('Victor Edit VIP preserves focus and selected text as existing information is updated', async () => {
    vips = [{ id: 'vip-1', full_name: 'Jane Doe', title: 'Minister', organization: 'Ministry', contact_info: 'jane@example.test', notes: 'Original note', access_level: 'vip', photo_url: '' }]
    await mount(React.createElement(VIPManagementPanel, { canManage: true, theatreId: 'theatre-1' }))
    const edit = document.querySelector('button[aria-label*="Edit"]') || document.querySelector('button[title*="Edit"]')
    await click(edit)
    const field = document.getElementById('full_name')
    field.focus(); field.setSelectionRange(5, 8)
    await enter(field, 'Smith')
    const notes = document.getElementById('notes')
    notes.setSelectionRange(notes.value.length, notes.value.length)
    await enter(notes, ' — updated')
    await act(async () => document.querySelector('[role="dialog"] form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(writes.at(-1).operation, 'update')
    assert.equal(writes.at(-1).id, 'vip-1')
    assert.equal(writes.at(-1).payload.full_name, 'Jane Smith')
    assert.equal(writes.at(-1).payload.notes, 'Original note — updated')
  })
  await t.test('My Profile keeps unsaved text and caret during background/headshot refreshes, but resets for a different officer', async () => {
    currentUser = { id: 'officer-1', full_name: 'Jane Doe', email: 'jane@example.test', role: 'delta_oscar', oscar: 'Delta', team: 'strength', photo_url: null, local_government_area: 'Ikeja', state: 'Lagos' }
    const ProfilePage = load('app/(dashboard)/profile/page.tsx').default
    await mount(React.createElement(ProfilePage))
    const name = document.querySelector('input[placeholder="John Doe"]')
    name.focus(); name.setSelectionRange(5, 8)
    await enter(name, 'Smith')
    const lga = document.getElementById('profile-lga')
    lga.setSelectionRange(lga.value.length, lga.value.length)
    await enter(lga, ' North')
    const caret = lga.selectionStart
    currentUser = { ...currentUser, photo_url: 'https://images.example.test/new-headshot.jpg', role: 'captain', oscar: 'Command', team: null }
    await act(async () => root.render(React.createElement(ProfilePage)))
    assert.equal(name.value, 'Jane Smith')
    assert.equal(lga.value, 'Ikeja North')
    assert.ok(document.activeElement === lga)
    assert.equal(lga.selectionStart, caret)
    assert.ok(document.querySelector('img[src="https://images.example.test/new-headshot.jpg"]'))
    assert.ok(document.querySelector('input[disabled][value="Command"]'))
    currentUser = { ...currentUser, id: 'officer-2', full_name: 'Another Officer', local_government_area: 'Surulere' }
    await act(async () => root.render(React.createElement(ProfilePage)))
    assert.equal(name.value, 'Another Officer')
    assert.equal(lga.value, 'Surulere')
  })
})
