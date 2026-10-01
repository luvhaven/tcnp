const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const moduleUnderTest = { exports: {} }
// Loaded into THIS realm rather than through vm.runInNewContext: these helpers
// return arrays and objects the assertions deep-compare, and a separate context
// gives them a different Object.prototype, which assert/strict rejects.
new Function('exports', 'module', 'require', ts.transpileModule(fs.readFileSync('lib/papa-meal-orders.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(moduleUnderTest.exports, moduleUnderTest, require)
const {
  normalizeSelectedItems, menuItemsForSlot, menuForSlot, toggleItem, orderKey,
  findExistingOrder, dietaryNotes, hasDietaryRestriction, papaDisplayName,
  buildOrderPayload, orderProgress,
} = moduleUnderTest.exports

const menus = [
  { id: 'm1', program_id: 'p1', menu_date: '2026-10-02', meal_type: 'lunch', title: 'Lunch', items: ['Jollof rice', 'Grilled fish'] },
  { id: 'm2', program_id: 'p1', menu_date: '2026-10-02', meal_type: 'all_day', title: 'Standing', items: ['Fruit platter', 'Jollof rice'] },
  { id: 'm3', program_id: 'p1', menu_date: '2026-10-03', meal_type: 'lunch', title: 'Next day', items: ['Egusi'] },
]

test('selected items are label snapshots, not positions into the menu', () => {
  assert.deepEqual(normalizeSelectedItems(['Jollof rice', ' Grilled fish ']), ['Jollof rice', 'Grilled fish'])
  assert.deepEqual(normalizeSelectedItems([{ label: 'Jollof rice' }]), ['Jollof rice'])
  // A malformed or legacy row must not block the floor from re-taking the order.
  for (const bad of [null, undefined, 'Jollof rice', 42, { items: [] }]) assert.deepEqual(normalizeSelectedItems(bad), [])
  assert.deepEqual(normalizeSelectedItems(['Jollof rice', 'Jollof rice', '', 0]), ['Jollof rice'])
})

test('a meal offers that day only, and all-day menus are on offer at every sitting', () => {
  assert.deepEqual(menuItemsForSlot(menus, '2026-10-02', 'lunch'), ['Jollof rice', 'Grilled fish', 'Fruit platter'])
  assert.deepEqual(menuItemsForSlot(menus, '2026-10-02', 'dinner'), ['Fruit platter', 'Jollof rice'])
  assert.deepEqual(menuItemsForSlot(menus, '2026-10-03', 'lunch'), ['Egusi'])
  assert.deepEqual(menuItemsForSlot(menus, '2026-10-04', 'lunch'), [])
})

test('an order is attributed to the exact meal menu before the all-day one', () => {
  assert.equal(menuForSlot(menus, '2026-10-02', 'lunch').id, 'm1')
  assert.equal(menuForSlot(menus, '2026-10-02', 'dinner').id, 'm2')
  assert.equal(menuForSlot(menus, '2026-10-04', 'lunch'), null)
})

test('ticking an item off toggles it without disturbing the rest', () => {
  assert.deepEqual(toggleItem(['Jollof rice'], 'Grilled fish'), ['Jollof rice', 'Grilled fish'])
  assert.deepEqual(toggleItem(['Jollof rice', 'Grilled fish'], 'Jollof rice'), ['Grilled fish'])
})

test('re-ordering the same Papa, date and meal finds the existing order', () => {
  const orders = [
    { id: 'o1', papa_id: 'papa-1', order_date: '2026-10-02', meal_type: 'lunch', status: 'draft', selected_items: ['Jollof rice'] },
    { id: 'o2', papa_id: 'papa-1', order_date: '2026-10-02', meal_type: 'dinner', status: 'draft', selected_items: [] },
  ]
  assert.equal(findExistingOrder(orders, 'papa-1', '2026-10-02', 'lunch').id, 'o1')
  assert.equal(findExistingOrder(orders, 'papa-1', '2026-10-02', 'dinner').id, 'o2')
  assert.equal(findExistingOrder(orders, 'papa-2', '2026-10-02', 'lunch'), null)
  assert.equal(findExistingOrder(orders, 'papa-1', '2026-10-03', 'lunch'), null)
  assert.equal(orderKey('papa-1', '2026-10-02', 'lunch'), 'papa-1|2026-10-02|lunch')
})

test('dietary restrictions fall back the same way the Nest arrivals card does', () => {
  assert.equal(dietaryNotes({ id: 'a', dietary_restrictions: 'No shellfish', food_preferences: 'Rice' }), 'No shellfish')
  assert.equal(dietaryNotes({ id: 'a', dietary_restrictions: '', food_preferences: 'Rice' }), 'Rice')
  assert.equal(dietaryNotes({ id: 'a' }), 'No dietary restriction recorded')
  assert.equal(dietaryNotes(null), 'No dietary restriction recorded')
  assert.equal(hasDietaryRestriction({ id: 'a', food_preferences: 'Rice' }), true)
  assert.equal(hasDietaryRestriction({ id: 'a' }), false)
  assert.equal(papaDisplayName({ id: 'a', title: 'Pastor', full_name: 'Ada Obi' }), 'Pastor Ada Obi')
  assert.equal(papaDisplayName({ id: 'a' }), 'Papa')
})

test('an order payload snapshots the labels and refuses to save nothing', () => {
  const draft = {
    papaId: 'papa-1', programId: 'p1', menuId: 'm1', date: '2026-10-02', mealType: 'lunch',
    selectedItems: ['Jollof rice', 'Jollof rice'], note: '  extra pepper  ', status: 'draft', takenBy: 'user-1',
  }
  const payload = buildOrderPayload(draft)
  assert.deepEqual(payload.selected_items, ['Jollof rice'])
  assert.equal(payload.note, 'extra pepper')
  assert.equal(payload.menu_id, 'm1')
  assert.equal(payload.status, 'draft')
  assert.equal(payload.taken_by, 'user-1')
  // A note alone is a legitimate order — the Papa may ask for something off-menu.
  assert.deepEqual(buildOrderPayload({ ...draft, selectedItems: [] }).selected_items, [])
  assert.throws(() => buildOrderPayload({ ...draft, selectedItems: [], note: '   ' }), /at least one item/)
  // Empty program/menu are stored as null, not as empty strings.
  const unattached = buildOrderPayload({ ...draft, programId: '', menuId: '' })
  assert.equal(unattached.program_id, null)
  assert.equal(unattached.menu_id, null)
})

test('progress counts Papas with a live order, not cancelled ones', () => {
  const papas = [{ id: 'papa-1' }, { id: 'papa-2' }, { id: 'papa-3' }]
  const orders = [
    { id: 'o1', papa_id: 'papa-1', order_date: '2026-10-02', meal_type: 'lunch', status: 'submitted' },
    { id: 'o2', papa_id: 'papa-2', order_date: '2026-10-02', meal_type: 'lunch', status: 'cancelled' },
  ]
  assert.deepEqual(orderProgress(papas, orders, '2026-10-02', 'lunch'), { taken: 1, total: 3 })
})
