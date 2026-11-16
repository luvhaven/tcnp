const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/den-inventory.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const {
  ratingLabel, timesUsed, formatMoney, parseAmount, stockLevel, availableStock,
  formatQuantity, previewMovement, compareInventoryItems,
} = mod.exports
// Values built inside the vm context carry that context's prototypes.
const deepEq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

const migration = fs.readFileSync('supabase/migrations/20261116120000_den_vendors_and_inventory.sql', 'utf8')
const item = (overrides) => ({ id: 'i', name: 'Water', category: null, unit: 'pcs', quantity: 10, reorder_level: 0, storage_location: null, notes: null, is_active: true, ...overrides })

test('vendor ratings and usage read plainly', () => {
  assert.equal(ratingLabel(null), 'Not rated yet')
  assert.equal(ratingLabel({ average_rating: null, rating_count: 0 }), 'Not rated yet')
  assert.equal(ratingLabel({ average_rating: 4.5, rating_count: 6 }), '4.5 (6)')
  assert.equal(ratingLabel({ average_rating: '4', rating_count: 1 }), '4.0 (1)')
  assert.equal(timesUsed({ engagement_count: 2, menu_count: 3 }), 5)
  assert.equal(timesUsed(undefined), 0)
})

test('money is grouped and drops empty kobo', () => {
  assert.equal(formatMoney(12500), 'NGN 12,500')
  assert.equal(formatMoney('1234567.5'), 'NGN 1,234,567.50')
  assert.equal(formatMoney(0), 'NGN 0')
  assert.equal(formatMoney(null), '—')
  assert.equal(formatMoney('abc'), '—')
})

test('typed amounts are accepted only when they are clean numbers', () => {
  assert.equal(parseAmount('12,500'), 12500)
  assert.equal(parseAmount(' 2.5 '), 2.5)
  assert.equal(parseAmount('2.555'), null)
  assert.equal(parseAmount('1e3'), null)
  assert.equal(parseAmount('abc'), null)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('0'), null)
  assert.equal(parseAmount('0', { allowZero: true }), 0)
  assert.equal(parseAmount('-3'), null)
  assert.equal(parseAmount('-3', { allowNegative: true }), -3)
})

test('stock is low only against a reorder level the Team Lead has set', () => {
  assert.equal(stockLevel(item({ quantity: 0, reorder_level: 5 })), 'out')
  assert.equal(stockLevel(item({ quantity: 5, reorder_level: 5 })), 'low')
  assert.equal(stockLevel(item({ quantity: 6, reorder_level: 5 })), 'ok')
  assert.equal(stockLevel(item({ quantity: 1, reorder_level: 0 })), 'ok')
  assert.equal(stockLevel(item({ quantity: '3.00', reorder_level: '10.00' })), 'low')
})

test('free stock is what is not reserved, and never negative', () => {
  assert.equal(availableStock(item({ quantity: 10 }), 4), 6)
  assert.equal(availableStock(item({ quantity: 10 }), 15), 0)
  assert.equal(availableStock(item({ quantity: 10 }), -2), 10)
  assert.equal(formatQuantity('12.00'), '12')
  assert.equal(formatQuantity(2.5), '2.5')
  assert.equal(formatQuantity(undefined), '0')
})

test('a movement is previewed with the same rules the database applies', () => {
  deepEq(previewMovement(item({ quantity: 10 }), 'use', 4), { ok: true, after: 6, change: -4 })
  deepEq(previewMovement(item({ quantity: 10 }), 'receive', 24), { ok: true, after: 34, change: 24 })
  deepEq(previewMovement(item({ quantity: 10 }), 'count', 7), { ok: true, after: 7, change: -3 })
  deepEq(previewMovement(item({ quantity: 10 }), 'count', 0), { ok: true, after: 0, change: -10 })
  deepEq(previewMovement(item({ quantity: 10 }), 'adjust', -6), { ok: true, after: 4, change: -6 })
  assert.equal(previewMovement(item({ quantity: 10 }), 'use', 11).ok, false)
  assert.match(previewMovement(item({ quantity: 10 }), 'use', 11).reason, /Only 10 pcs of Water/)
  assert.equal(previewMovement(item({ quantity: 10 }), 'use', 0).ok, false)
  assert.equal(previewMovement(item({ quantity: 10 }), 'receive', -1).ok, false)
  assert.equal(previewMovement(item({ quantity: 10 }), 'count', -1).ok, false)
  assert.equal(previewMovement(item({ quantity: 10 }), 'adjust', 0).ok, false)
  assert.equal(previewMovement(item({ quantity: 10 }), 'adjust', -11).ok, false)
  // No floating-point dust in the result.
  deepEq(previewMovement(item({ quantity: 0.3 }), 'use', 0.1), { ok: true, after: 0.2, change: -0.1 })
})

test('items needing attention come first', () => {
  const sorted = [
    item({ name: 'Towels', quantity: 50, reorder_level: 10 }),
    item({ name: 'Water', quantity: 5, reorder_level: 10 }),
    item({ name: 'Glasses', quantity: 0, reorder_level: 10 }),
    item({ name: 'Cups', quantity: 80, reorder_level: 10 }),
  ].sort(compareInventoryItems).map(entry => entry.name)
  deepEq(sorted, ['Glasses', 'Water', 'Cups', 'Towels'])
})

test('stock can only change through the ledger function', () => {
  const guard = migration.match(/FUNCTION public\.guard_den_inventory_quantity[\s\S]*?\$\$;/)[0]
  assert.match(guard, /NEW\.quantity IS DISTINCT FROM OLD\.quantity/)
  assert.match(guard, /NEW\.quantity := 0/)
  // The ledger is read-only to the app: a SELECT policy and nothing else.
  const movementPolicies = [...migration.matchAll(/CREATE POLICY \w+ ON public\.den_inventory_movements\s+FOR (\w+)/g)].map(match => match[1])
  deepEq(movementPolicies, ['SELECT'])
  const record = migration.match(/FUNCTION public\.den_record_stock[\s\S]*?\$\$;/)[0]
  assert.match(record, /FOR UPDATE/)
  assert.match(record, /IF new_quantity < 0 THEN/)
  assert.match(record, /INSERT INTO public\.den_inventory_movements/)
})

test('members record usage for their programme; receiving and counting stay with the Team Lead', () => {
  const record = migration.match(/FUNCTION public\.den_record_stock[\s\S]*?\$\$;/)[0]
  const useBranch = record.match(/IF movement = 'use' THEN[\s\S]*?ELSIF movement IN/)[0]
  assert.match(useBranch, /can_coordinate_unit\('november_den'\)/)
  assert.match(useBranch, /den_can_take_programme_work\(auth\.uid\(\), target_program\)/)
  const manageBranch = record.match(/ELSIF movement IN \('receive', 'count', 'adjust'\) THEN[\s\S]*?ELSE\s+RAISE EXCEPTION 'Unknown stock movement'/)[0]
  assert.match(manageBranch, /IF NOT public\.can_manage_unit\('november_den'\) THEN/)
  assert.match(manageBranch, /Say why the stock is being adjusted/)
})

test('the low-stock alert fires once, on the way down, to the people who reorder', () => {
  const record = migration.match(/FUNCTION public\.den_record_stock[\s\S]*?\$\$;/)[0]
  assert.match(record, /item\.reorder_level > 0 AND item\.quantity > item\.reorder_level AND new_quantity <= item\.reorder_level/)
  assert.match(record, /'den_low_stock'/)
  assert.match(record, /access_level IN \('head', 'sub_lead'\)/)
})

test('vendor ratings are open to all officers; prices and spend are not; existing vendor rules are untouched', () => {
  assert.match(migration, /CREATE POLICY vendor_ratings_select[\s\S]*?is_active_member\(\)/)
  for (const table of ['vendor_price_items', 'vendor_engagements']) {
    const select = migration.match(new RegExp(`CREATE POLICY ${table}_select[\\s\\S]*?;`))[0]
    assert.doesNotMatch(select, /is_active_member/)
    assert.match(select, /is_unit_member\('november_den'\) OR public\.can_edit_vendors\(\)/)
  }
  // A rating is always under the rater's own name.
  assert.match(migration, /CREATE POLICY vendor_ratings_insert[\s\S]*?created_by = auth\.uid\(\)/)
  // The summary every officer can call returns no money.
  const summary = migration.match(/FUNCTION public\.vendor_summaries[\s\S]*?\$\$;/)[0]
  assert.doesNotMatch(summary, /price|amount/)
  // Nothing existing on vendors is dropped or replaced.
  for (const dropped of migration.matchAll(/DROP POLICY IF EXISTS (\w+) ON public\.vendors\b/g)) assert.match(dropped[1], /^vendors_den_head_/)
  for (const name of ['vendors_select', 'vendors_insert', 'vendors_update', 'vendors_delete']) {
    assert.doesNotMatch(migration, new RegExp(`POLICY (IF EXISTS )?${name} `))
  }
  for (const table of ['vendor_price_items', 'vendor_engagements', 'vendor_ratings', 'den_inventory_items', 'den_inventory_movements', 'den_inventory_reservations']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }
  assert.doesNotMatch(migration, /UPDATE public\.users|ALTER TYPE/i)
})
