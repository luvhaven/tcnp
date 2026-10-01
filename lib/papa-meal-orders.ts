/**
 * Pure helpers behind the per-Papa meal ordering screen (#73).
 *
 * The ordering component is a phone-in-hand interface used standing in front of
 * a Papa, so everything that can be decided without the network lives here and
 * is tested directly — the component is left holding only state and markup.
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'all_day'

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'all_day', label: 'All day' },
]

export type OrderStatus = 'draft' | 'submitted' | 'fulfilled' | 'cancelled'

export type PapaMealOrder = {
  id: string
  program_id: string | null
  papa_id: string
  menu_id: string | null
  order_date: string
  meal_type: string
  selected_items: unknown
  note: string | null
  status: string
  taken_by: string | null
  taken_at: string | null
}

export type MenuForSlot = {
  id: string
  program_id: string | null
  menu_date: string
  meal_type: string
  title: string
  items: unknown
  vendors?: { id: string; name: string; is_active: boolean } | null
}

export type OrderablePapa = {
  id: string
  full_name?: string | null
  title?: string | null
  program_id?: string | null
  dietary_restrictions?: string | null
  food_preferences?: string | null
  special_requirements?: string | null
}

/**
 * The dish names on an order are a SNAPSHOT, never indexes into
 * program_menus.items — officers reorder and rewrite that array freely, so a
 * positional reference would silently re-point an old order at a different dish.
 * Rows written before this shape settled, or by hand, may still be anything;
 * coerce rather than throw, because a malformed row must not block the floor
 * from re-taking the order.
 */
export function normalizeSelectedItems(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const labels = value
    .map(entry => {
      if (typeof entry === 'string') return entry.trim()
      if (entry && typeof entry === 'object' && typeof (entry as any).label === 'string') {
        return (entry as any).label.trim()
      }
      return ''
    })
    .filter(Boolean)
  return Array.from(new Set(labels))
}

/** Dish names a Papa can be offered for one date and meal, de-duplicated across menus. */
export function menuItemsForSlot(menus: MenuForSlot[], date: string, mealType: string): string[] {
  const seen = new Set<string>()
  for (const menu of menus) {
    if (menu.menu_date !== date) continue
    // 'all_day' menus are on offer at every sitting, and a Papa ordering an
    // all_day meal may pick from any of that day's menus.
    if (menu.meal_type !== mealType && menu.meal_type !== 'all_day' && mealType !== 'all_day') continue
    for (const label of normalizeSelectedItems(menu.items)) seen.add(label)
  }
  return Array.from(seen)
}

/** The menu an order should be attributed to: the exact meal match wins over an all-day menu. */
export function menuForSlot(menus: MenuForSlot[], date: string, mealType: string): MenuForSlot | null {
  const sameDay = menus.filter(menu => menu.menu_date === date)
  return (
    sameDay.find(menu => menu.meal_type === mealType) ??
    sameDay.find(menu => menu.meal_type === 'all_day') ??
    null
  )
}

export function toggleItem(selected: string[], label: string): string[] {
  return selected.includes(label) ? selected.filter(item => item !== label) : [...selected, label]
}

/**
 * One order per Papa per meal per day, matching the unique index. Reopening a
 * Papa must show the order already taken rather than starting a second one.
 */
export function orderKey(papaId: string, date: string, mealType: string): string {
  return `${papaId}|${date}|${mealType}`
}

export function findExistingOrder(
  orders: PapaMealOrder[],
  papaId: string,
  date: string,
  mealType: string
): PapaMealOrder | null {
  const key = orderKey(papaId, date, mealType)
  return orders.find(order => orderKey(order.papa_id, order.order_date, order.meal_type) === key) ?? null
}

/**
 * What the officer must be able to read without leaving the ordering screen.
 * Same precedence as the Nest arrivals card in RoomOperations.tsx, so the two
 * screens never disagree about a Papa's restrictions.
 */
export function dietaryNotes(papa: OrderablePapa | null | undefined): string {
  if (!papa) return 'No dietary restriction recorded'
  return papa.dietary_restrictions || papa.food_preferences || 'No dietary restriction recorded'
}

export function hasDietaryRestriction(papa: OrderablePapa | null | undefined): boolean {
  return !!(papa?.dietary_restrictions || papa?.food_preferences)
}

export function papaDisplayName(papa: OrderablePapa | null | undefined): string {
  if (!papa) return 'Papa'
  return [papa.title, papa.full_name].filter(Boolean).join(' ') || 'Papa'
}

export type OrderDraft = {
  papaId: string
  programId: string | null
  menuId: string | null
  date: string
  mealType: string
  selectedItems: string[]
  note: string
  status: OrderStatus
  takenBy: string | null
}

/**
 * Build the row to write. Returned without an id: the caller upserts on
 * (papa_id, order_date, meal_type) so re-ordering updates the existing order
 * instead of tripping the unique index with a second row.
 */
export function buildOrderPayload(draft: OrderDraft) {
  const selected = normalizeSelectedItems(draft.selectedItems)
  if (selected.length === 0 && !draft.note.trim()) {
    throw new Error('Choose at least one item, or add a note about what the Papa asked for')
  }
  return {
    papa_id: draft.papaId,
    program_id: draft.programId || null,
    menu_id: draft.menuId || null,
    order_date: draft.date,
    meal_type: draft.mealType,
    selected_items: selected,
    note: draft.note.trim() || null,
    status: draft.status,
    taken_by: draft.takenBy || null,
    taken_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/** Progress line for the day: how many of the Papas on screen have an order taken. */
export function orderProgress(papas: OrderablePapa[], orders: PapaMealOrder[], date: string, mealType: string) {
  const taken = papas.filter(papa => {
    const order = findExistingOrder(orders, papa.id, date, mealType)
    return !!order && order.status !== 'cancelled'
  }).length
  return { taken, total: papas.length }
}
