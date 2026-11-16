/**
 * November (Den) — vendor and inventory rules. Dependency-free so
 * tests/den-inventory.test.cjs can load it directly. Mirrors
 * supabase/migrations/20261116120000_den_vendors_and_inventory.sql.
 */

// ── Vendors ──

export const VENDOR_SERVICE_CATEGORIES = [
  'Catering', 'Drinks', 'Small chops', 'Cakes & pastries', 'Fruit', 'Tableware & linen',
  'Flowers & décor', 'Cleaning', 'Equipment hire', 'Logistics', 'Other',
] as const

export type VendorSummary = {
  vendor_id: string
  average_rating: number | null
  rating_count: number
  engagement_count: number
  menu_count: number
  last_used: string | null
}

export type VendorEngagementStatus = 'planned' | 'confirmed' | 'delivered' | 'cancelled'

export const VENDOR_ENGAGEMENT_STATUS_LABEL: Record<VendorEngagementStatus, string> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** "4.5 (6)" for a card, or a plain word when nobody has rated yet. */
export function ratingLabel(summary: Pick<VendorSummary, 'average_rating' | 'rating_count'> | null | undefined): string {
  if (!summary || !summary.rating_count || summary.average_rating == null) return 'Not rated yet'
  return `${Number(summary.average_rating).toFixed(1)} (${summary.rating_count})`
}

/** How many times a vendor has actually been used: engagements plus menus. */
export function timesUsed(summary: Pick<VendorSummary, 'engagement_count' | 'menu_count'> | null | undefined): number {
  return (summary?.engagement_count ?? 0) + (summary?.menu_count ?? 0)
}

/** A money amount as the Den writes it: "NGN 12,500" or "NGN 12,500.50". */
export function formatMoney(amount: number | string | null | undefined, currency = 'NGN'): string {
  const value = Number(amount)
  if (amount == null || amount === '' || !Number.isFinite(value)) return '—'
  const [whole, fraction] = value.toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${currency} ${grouped}${fraction === '00' ? '' : `.${fraction}`}`
}

/** What a typed amount means, or null when it is not a usable number. */
export function parseAmount(text: string, options: { allowNegative?: boolean; allowZero?: boolean } = {}): number | null {
  const cleaned = text.replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  if (value < 0 && !options.allowNegative) return null
  if (value === 0 && !options.allowZero) return null
  return value
}

// ── Inventory ──

export type DenInventoryItem = {
  id: string
  name: string
  category: string | null
  unit: string
  quantity: number
  reorder_level: number
  storage_location: string | null
  notes: string | null
  is_active: boolean
}

export type StockMovementType = 'receive' | 'use' | 'count' | 'adjust'

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  receive: 'Received',
  use: 'Used',
  count: 'Counted',
  adjust: 'Adjusted',
}

export type StockLevel = 'out' | 'low' | 'ok'

/**
 * Out when there is none; low at or below the reorder level. An item with no
 * reorder level set is never "low" — the Team Lead has not asked to be warned.
 */
export function stockLevel(item: Pick<DenInventoryItem, 'quantity' | 'reorder_level'>): StockLevel {
  const quantity = Number(item.quantity)
  if (quantity <= 0) return 'out'
  return Number(item.reorder_level) > 0 && quantity <= Number(item.reorder_level) ? 'low' : 'ok'
}

/** Stock not yet promised to any programme. Never negative. */
export function availableStock(item: Pick<DenInventoryItem, 'quantity'>, reserved: number): number {
  return Math.max(0, Number(item.quantity) - Math.max(0, reserved))
}

/** "12", "2.5" — no trailing zeros. */
export function formatQuantity(value: number | string | null | undefined): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return String(Math.round(number * 100) / 100)
}

/**
 * What a movement will do to the count, checked before it is sent so the
 * officer sees the problem on the form. The database applies the same rules.
 */
export function previewMovement(
  item: Pick<DenInventoryItem, 'quantity' | 'unit' | 'name'>,
  movement: StockMovementType,
  amount: number,
): { ok: true; after: number; change: number } | { ok: false; reason: string } {
  const quantity = Number(item.quantity)
  if (!Number.isFinite(amount)) return { ok: false, reason: 'Enter a number.' }
  let change: number
  if (movement === 'use') {
    if (amount <= 0) return { ok: false, reason: 'Enter how many were used.' }
    change = -amount
  } else if (movement === 'receive') {
    if (amount <= 0) return { ok: false, reason: 'Enter how many were received.' }
    change = amount
  } else if (movement === 'count') {
    if (amount < 0) return { ok: false, reason: 'A count cannot be negative.' }
    change = amount - quantity
  } else {
    if (amount === 0) return { ok: false, reason: 'An adjustment cannot be zero.' }
    change = amount
  }
  const after = Math.round((quantity + change) * 100) / 100
  if (after < 0) return { ok: false, reason: `Only ${formatQuantity(quantity)} ${item.unit} of ${item.name} in stock.` }
  return { ok: true, after, change: Math.round(change * 100) / 100 }
}

/** Items that need attention first, then the rest by name. */
export function compareInventoryItems(a: DenInventoryItem, b: DenInventoryItem): number {
  const order: Record<StockLevel, number> = { out: 0, low: 1, ok: 2 }
  return order[stockLevel(a)] - order[stockLevel(b)] || a.name.localeCompare(b.name)
}

export const DEN_VENDOR_KEY = ['vendors', 'den-details'] as const
export const DEN_INVENTORY_KEY = ['den', 'inventory'] as const
