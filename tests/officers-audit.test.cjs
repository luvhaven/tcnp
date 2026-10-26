const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function compile(file, imports = {}, globals = {}) {
 const mod = { exports: {} }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), console, ...globals })
 return mod.exports
}
const directory = compile('lib/officer-directory.ts')
const base = { email: 'officer@example.test', is_active: true, activation_status: 'active', team: null, oscar: null, created_at: '2026-10-01', phone: null, unit: null, current_title_id: null }
const officers = [
 { ...base, id: 'captain', full_name: 'Captain One', role: 'captain', current_title_id: 'captain-title' },
 { ...base, id: 'vice-one', full_name: 'Vice One', role: 'vice_captain', current_title_id: 'vice-title' },
 { ...base, id: 'vice-two', full_name: 'Vice Two', role: 'vice_captain' },
 { ...base, id: 'pending', full_name: 'Pending Officer', role: 'viewer', activation_status: 'pending', is_active: false },
 { ...base, id: 'legacy', full_name: 'Legacy Nest', role: 'hospitality_oscar', is_active: false, activation_status: 'inactive' },
 { ...base, id: 'owner', full_name: 'Owner', role: 'super_admin' },
]
test('leadership counts people by role, including the untitled second Vice Captain', () => {
 assert.equal(directory.leadershipSummary(officers), '1 Captain · 2 Vice Captains')
 assert.equal(directory.filterDirectoryOfficers(officers, { status: 'active', role: 'vice_captain', team: 'all', search: '' }).length, 2)
 assert.equal(officers.filter(officer => officer.current_title_id).length, 2, 'title holders and leadership people are different counts')
})
test('role aliases share a category and label, and readable role searches trim whitespace', () => {
 assert.equal(directory.officerRoleLabel('hospitality_oscar'), directory.officerRoleLabel('noscar_nest'))
 assert.equal(directory.officerRoleLabel('super_admin'), 'Super Admin')
 assert.equal(directory.officerRoleLabel('dev_admin'), 'Developer Admin')
 const filter = { status: 'all', role: 'all', team: 'all', search: '  vice captain  ' }
 assert.equal(directory.filterDirectoryOfficers(officers, filter).length, 2)
 assert.equal(directory.filterDirectoryOfficers(officers, { ...filter, search: '', role: 'noscar_nest' })[0].id, 'legacy')
 assert.ok(directory.OFFICER_CATEGORIES.find(category => category.id === 'others').roles.includes('super_admin'))
 for (const officer of officers) assert.equal(directory.OFFICER_CATEGORIES.filter(category => category.roles.includes(directory.canonicalOfficerRole(officer.role))).length, 1, officer.role)
})
test('pending, active and inactive are disjoint even when stored flags disagree', () => {
 assert.equal(directory.officerAccountStatus({ is_active: true, activation_status: 'pending' }), 'Pending')
 assert.equal(directory.officerAccountStatus({ is_active: true, activation_status: 'inactive' }), 'Inactive')
 assert.equal(directory.officerAccountStatus({ is_active: false, activation_status: 'active' }), 'Inactive')
 assert.equal(directory.filterDirectoryOfficers(officers, { status: 'inactive', role: 'all', team: 'all', search: '' }).length, 1)
})
test('select all only changes visible IDs, preserves hidden selections and never duplicates an officer', () => {
 assert.deepEqual(Array.from(directory.toggleVisibleOfficerSelection(['hidden','one'], ['one','two'], true)), ['hidden','one','two'])
 assert.deepEqual(Array.from(directory.toggleVisibleOfficerSelection(['hidden','one','two'], ['one','two'], false)), ['hidden'])
})
test('CSV safely exports quotes, newlines and potential formulas as text', () => {
 assert.equal(directory.officerCSVCell('Officer "A", B\nC'), '"Officer ""A"", B\nC"')
 for (const value of ['=HYPERLINK("evil")',' +234123','@SUM(A1)','-1']) assert.ok(directory.officerCSVCell(value).startsWith('"\''))
})
function bulkRoute({ status = 'active', role = 'vice_captain', failRPC = false, failUpdate = false, active = true } = {}) {
 const calls = [], updates = []
 const db = { from(table) {
  const query = { select: () => query, eq: () => query, in: () => query,
   maybeSingle: async () => ({ data: { status } }),
   update: patch => { updates.push(patch); return query },
   then: resolve => resolve({ error: failUpdate && updates.length ? Error('write failed') : null, data: table === 'current_title_assignments' ? [] : table === 'official_titles' ? [{ id: 'unrelated', code: 'PROF' }, { id: 'vice-title', code: 'VICE_CAPTAIN', unit: 'leadership' }] : [{ id: 'vice-two', role, current_title_id: null, is_active: active, activation_status: active ? 'active' : 'inactive' }] }),
  }; return query
 }, rpc: async (_, args) => { calls.push(args); return { error: failRPC ? Error('capacity reached') : null } } }
 const serverQuery = { select() { return this }, eq() { return this }, or() { return this }, single: async () => ({ data: { role: 'super_admin' } }) }
 const utils = compile('lib/utils.ts')
 const route = compile('app/api/admin/bulk-assign-program/route.ts', { 'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) }, from: () => serverQuery }) }, '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/utils': utils })
 return { run: () => route.POST({ json: async () => ({ officer_ids: ['vice-two'], program_id: 'program' }) }), calls, updates }
}
test('bulk assignment maps the second Vice Captain correctly and blocks closed programs before writes', async () => {
 const vice = bulkRoute(); const result = await vice.run()
 assert.equal(result.body.assigned_count, 1)
 assert.equal(vice.calls[0].p_title_code, 'VICE_CAPTAIN')
 for (const status of ['archived','completed','cancelled']) {
  const closed = bulkRoute({ status }); assert.equal((await closed.run()).status, 409); assert.equal(closed.calls.length, 0); assert.equal(closed.updates.length, 0)
 }
})
test('unmapped roles, inactive accounts and failed writes never report full assignment success or use an arbitrary title', async () => {
 const unmapped = bulkRoute({ role: 'viewer' }); const missing = await unmapped.run()
 assert.equal(unmapped.calls.length, 0); assert.equal(missing.body.failed_count, 1); assert.equal(missing.body.assigned_count, 0)
 const inactive = bulkRoute({ active: false }); const skipped = await inactive.run()
 assert.equal(inactive.calls.length, 0); assert.equal(skipped.body.inactive_count, 1)
 for (const options of [{ failRPC: true }, { failUpdate: true }]) {
  const failed = await bulkRoute(options).run(); assert.equal(failed.status, 207); assert.equal(failed.body.assigned_count, 0); assert.equal(failed.body.failed_count, 1)
 }
})
let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}
test('actual Officers page shows both Vice Captains, filters correctly and keeps title edits separate from account roles', { skip: !JSDOM }, async t => {
 const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/officers', pretendToBeVisual: true })
 const previous = new Map()
 for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','Event','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','MutationObserver','Node','CustomEvent','IS_REACT_ACT_ENVIRONMENT']) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
 }
 const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
 const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false }, mutations: { retry: false } } })
 const mutationOptions = [], network = [], messages = [], selects = new Map(), cache = new Map()
 const queryResult = { officers, titles: [{ id: 'vice-title', code: 'VICE_CAPTAIN', name: 'Vice Captain', unit: 'leadership', max_positions: 2 }], programs: [{ id: 'program', name: 'Open program', status: 'active' }, { id: 'archived', name: 'Old program', status: 'archived' }] }
 const titleWrites = []; let clearFailure = false
 const supabase = { from: table => {
  const filters = {}; let patch
  const query = { select: () => query, order: () => query, limit: () => query,
   update: value => { patch = value; return query }, eq: (key, value) => { filters[key] = value; return query }, is: (key, value) => { filters[key] = value; return query },
   maybeSingle: async () => ({ data: { title_id: 'remaining-title' } }),
   single: async () => { titleWrites.push({ table, patch, filters }); return { data: patch } },
   then: resolve => { titleWrites.push({ table, patch, filters }); resolve({ error: clearFailure ? Error('denied') : null }) },
  }; return query
 }, rpc: async () => ({ error: null }) }
 const motionTags = new Map()
 const motion = new Proxy({}, { get(_, tag) { if (!motionTags.has(tag)) motionTags.set(tag, React.forwardRef(({ children, initial, animate, exit, transition, layout, ...props }, ref) => React.createElement(tag, { ...props, ref }, children))); return motionTags.get(tag) } })
 const selectAPI = {
  Select: ({ children, value, onValueChange }) => { const items = React.Children.toArray(children); const trigger = items.find(item => item.type === selectAPI.SelectTrigger); return React.createElement('select', { id: trigger?.props.id, 'aria-label': trigger?.props['aria-label'], value, onChange: event => onValueChange(event.target.value) }, children) },
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children, SelectGroup: ({ children }) => children, SelectLabel: () => null,
  SelectItem: ({ children, value, disabled }) => React.createElement('option', { value, disabled }, children),
 }
 const clientUser = { id: 'owner', role: 'super_admin', email: 'owner@example.test' }
 const params = new URLSearchParams()
 const globals = { window: dom.window, document, navigator, localStorage: dom.window.localStorage, Event: dom.window.Event, fetch: async (url, options) => { network.push({ url, options }); return { ok: true, json: async () => ({ success: true, assigned_count: 1 }) } } }
 const imports = new Proxy({}, { get(_, name) {
  if (name === '@/lib/supabase/client') return { createClient: () => supabase }
  if (name === 'next/navigation') return { useSearchParams: () => params }
  if (name === '@/lib/notify') return { notifyError: (_, message) => messages.push(message), UserFacingError: Error }
  if (name === 'sonner') return { toast: { success: message => messages.push(message), info: message => messages.push(message), warning: message => messages.push(message), error: message => messages.push(message) } }
  if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async () => false }
  if (name === '@/components/officers/OfficerProfileDialog') return { OfficerProfileDialog: () => null }
  if (name === '@/components/officers/PasswordResetRequestsTab') return { PasswordResetRequestsTab: () => null }
  if (name === '@/components/ui/select') return selectAPI
  if (name === 'framer-motion') return { motion, AnimatePresence: ({ children }) => children }
  if (name === '@tanstack/react-query') return { useQueryClient: () => queryClient,
   useQuery: options => ({ data: options.queryKey[0] === 'currentUserProfile' ? clientUser : options.queryKey[0] === 'officers' ? queryResult.officers : options.queryKey[0] === 'titles' ? queryResult.titles : options.queryKey[0] === 'programs' ? queryResult.programs : [], isPending: false, isError: false, isRefetching: false, refetch() {} }),
   useMutation: options => { const ref = React.useRef(options); ref.current = options; React.useState(() => { mutationOptions.push(ref); return true }); return { isPending: false, mutate: async value => { try { const result = await ref.current.mutationFn(value); ref.current.onSuccess?.(result, value) } catch (error) { ref.current.onError?.(error) } } } },
  }
  if (name.startsWith('@/')) return load(`${name.slice(2)}${name.startsWith('@/components/') ? '.tsx' : '.ts'}`)
 } })
 function load(file) { if (!cache.has(file)) cache.set(file, compile(file, imports, globals)); return cache.get(file) }
 const Page = load('app/(dashboard)/officers/OfficersClient.tsx').default
 const root = createRoot(document.getElementById('root'))
 t.after(async () => { await act(async () => root.unmount()); queryClient.clear(); dom.window.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
 await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Page, { initialOfficers: officers }))))
 const select = label => document.querySelector(`select[aria-label="${label}"]`)
 const change = async (node,value) => act(async () => { node.value = value; node.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
 const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text || node.getAttribute('aria-label') === text)
 await t.test('leadership includes both Vice Captains and administrators are not uncategorized', async () => {
  assert.ok(document.body.textContent.includes('1 Captain · 2 Vice Captains'))
  assert.ok(document.body.textContent.includes('Vice Two'))
  assert.ok(select('Filter by role').textContent.includes('Vice Captain (2)'))
  assert.ok(!document.body.textContent.includes('Uncategorized / External'))
 })
 await t.test('Vice Captain + Active filters keep the untitled officer and Pending status opens its matching tab', async () => {
  await change(select('Filter by role'), 'vice_captain'); await change(select('Filter by account status'), 'active')
  assert.ok(document.body.textContent.includes('Vice One') && document.body.textContent.includes('Vice Two'))
  assert.ok(!document.body.textContent.includes('Captain One'))
  await change(select('Filter by role'), 'all'); await change(select('Filter by account status'), 'pending')
  assert.ok(document.body.textContent.includes('Pending Officer'))
  assert.ok(!document.body.textContent.includes('Vice Two'))
  await act(async () => button('Directory').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  assert.equal(select('Filter by account status').value, 'all')
 })
 await t.test('title editing never sends a role update and Vice Captain capacity is explicit', async () => {
  await act(async () => button('Manage').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  const assign = button('Title')
  await act(async () => assign.click())
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes('Vice Captain · 2 positions'))
  assert.equal(document.getElementById('program').value, 'unassigned', 'do not silently choose an unrelated program')
  await change(document.getElementById('title'), 'vice-title')
  const mutation = mutationOptions[4].current
  const original = mutation.mutationFn; let payload
  mutation.mutationFn = async value => { payload = value }
  await act(async () => button('Save title assignment').click())
  assert.ok(payload)
  assert.equal('roleUpdate' in payload, false)
  mutation.mutationFn = original
 })
 await t.test('clearing one title scope preserves other assignments and chooses a remaining current title', async () => {
  const mutation = mutationOptions[4].current
  await mutation.mutationFn({ clearTitle: true, rpcData: { p_user_id: 'vice-two', p_program_id: 'program' } })
  assert.deepEqual(titleWrites[0].filters, { user_id: 'vice-two', program_id: 'program' })
  assert.equal(titleWrites[1].patch.current_title_id, 'remaining-title')
  titleWrites.length = 0
  clearFailure = true
  await assert.rejects(() => mutation.mutationFn({ clearTitle: true, rpcData: { p_user_id: 'vice-two', p_program_id: null } }), /denied/)
  assert.equal(titleWrites.length, 1, 'do not clear the pointer after an assignment update fails')
  assert.deepEqual(titleWrites[0].filters, { user_id: 'vice-two', program_id: null })
  clearFailure = false
 })
 await t.test('assigning a program title never reactivates a deactivated officer', async () => {
  network.length = 0
  await mutationOptions[4].current.mutationFn({ titleData: { title_id: 'vice-title' }, rpcData: { p_user_id: 'legacy', p_title_code: 'VICE_CAPTAIN', p_program_id: 'program' } })
  assert.equal(network.length, 0)
 })
 await t.test('bulk actions include only selected officers visible under the current filter', async () => {
  await act(async () => document.querySelector('input[aria-label="Select Vice One"]').click())
  await change(select('Filter by role'), 'captain')
  assert.ok(!button('Assign Selected (1) to Program'))
  await act(async () => document.querySelector('input[aria-label="Select Captain One"]').click())
  await act(async () => button('Assign Selected (1) to Program').click())
  await change(document.getElementById('assign_program'), 'program')
  await act(async () => button('Assign to Program').click())
  assert.deepEqual(JSON.parse(network.at(-1).options.body).officer_ids, ['captain'])
 })
 await t.test('blocked browser storage cannot break switching to table view', async () => {
  const original = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = () => { throw Error('storage blocked') }
  try { await act(async () => button('List view').click()); assert.ok(document.querySelector('table')) }
  finally { dom.window.Storage.prototype.setItem = original }
 })
})
