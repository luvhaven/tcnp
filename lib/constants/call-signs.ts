export type CallSignKey =
    | 'first_course'
    | 'dessert'
    | 'cocktail'
    | 'blue_cocktail'
    | 'red_cocktail'
    | 're_order'
    | 'chapman'
    | 'broken_arrow'
    | 'eta'
    | 'etd'

export type CallSignCategory = 'movement' | 'incident' | 'time'

export interface CallSign {
    key: CallSignKey
    label: string
    description: string
    category: CallSignCategory
    color: string // Tailwind class for background
}

export const CALL_SIGNS: CallSign[] = [
    {
        key: 'first_course',
        label: 'First Course',
        description: 'Departure from Nest to Theatre',
        category: 'movement',
        color: 'bg-blue-600',
    },
    {
        key: 'dessert',
        label: 'Dessert',
        description: 'Departure from Theatre to Nest',
        category: 'movement',
        color: 'bg-indigo-600',
    },
    {
        key: 'cocktail',
        label: 'Cocktail',
        description: 'Principal In-transit',
        category: 'movement',
        color: 'bg-green-600',
    },
    {
        key: 'blue_cocktail',
        label: 'Blue Cocktail',
        description: 'Mild traffic',
        category: 'movement',
        color: 'bg-yellow-600',
    },
    {
        key: 'red_cocktail',
        label: 'Red Cocktail',
        description: 'Heavy Traffic',
        category: 'movement',
        color: 'bg-orange-600',
    },
    {
        key: 're_order',
        label: 'Re-order',
        description: 'Route Change',
        category: 'movement',
        color: 'bg-purple-600',
    },
    {
        key: 'chapman',
        label: 'Chapman',
        description: 'Arrival at Theatre gate',
        category: 'movement',
        color: 'bg-teal-600',
    },
    {
        key: 'broken_arrow',
        label: 'Broken Arrow',
        description: 'Distress call for major incident',
        category: 'incident',
        color: 'bg-destructive',
    },
    {
        key: 'eta',
        label: 'ETA',
        description: 'Estimated Time of Arrival',
        category: 'time',
        color: 'bg-slate-600',
    },
    {
        key: 'etd',
        label: 'ETD',
        description: 'Estimated Time of Departure',
        category: 'time',
        color: 'bg-slate-600',
    },
]

export const getCallSignLabel = (key: string): string => {
    const sign = CALL_SIGNS.find(s => s.key === key)
    return sign ? sign.label : key
}

export const getCallSignColor = (key: string): string => {
    const sign = CALL_SIGNS.find(s => s.key === key)
    return sign ? sign.color : 'bg-slate-500'
}

// ── journey_events.event_type is the `call_sign` Postgres enum (Title Case + ──
// spaces).  This is the ONE canonical map from our JS keys (underscored) to the
// DB enum values.  Any code inserting into journey_events MUST go through this —
// inserting a raw underscored key (e.g. 'first_course') fails the enum check and
// the row is silently dropped.  Keys not present here are not valid enum values.
export const CALL_SIGN_KEY_TO_DB_ENUM: Partial<Record<CallSignKey, string>> = {
    first_course: 'First Course',
    cocktail: 'Cocktail',
    chapman: 'Chapman',
    dessert: 'Dessert',
    blue_cocktail: 'Blue Cocktail',
    red_cocktail: 'Red Cocktail',
    re_order: 'Re-order',
    broken_arrow: 'Broken Arrow',
}

/** Map a Title-Case call_sign enum value back to our underscored key. */
export const dbEnumToCallSignKey = (dbValue: string): CallSignKey | null => {
    const entry = Object.entries(CALL_SIGN_KEY_TO_DB_ENUM).find(([, v]) => v === dbValue)
    return (entry?.[0] as CallSignKey) ?? null
}

// ── SITREP glossary — the complete situation-report codes exactly per SOP ─────
// TCNP.01.05 (Journey Management). This is the authoritative reference shown to
// Duty Officers. Order follows a typical Nest → Theatre → Nest operation.
export type SitrepCode = {
    key: CallSignKey
    code: string
    meaning: string
    /** 'status' advances the journey; 'broadcast' is a live traffic/route update; 'emergency' is distress */
    kind: 'status' | 'broadcast' | 'emergency'
}

export const SITREP_CODES: SitrepCode[] = [
    { key: 'first_course', code: 'First Course', meaning: 'Departure from Nest to Theatre', kind: 'status' },
    { key: 'cocktail', code: 'Cocktail', meaning: 'Principal in-transit', kind: 'status' },
    { key: 'blue_cocktail', code: 'Blue Cocktail', meaning: 'Mild traffic', kind: 'broadcast' },
    { key: 'red_cocktail', code: 'Red Cocktail', meaning: 'Heavy traffic', kind: 'broadcast' },
    { key: 're_order', code: 'Re-order', meaning: 'Route change', kind: 'broadcast' },
    { key: 'chapman', code: 'Chapman', meaning: 'Arrival at Theatre gate', kind: 'status' },
    { key: 'dessert', code: 'Dessert', meaning: 'Departure from Theatre to Nest', kind: 'status' },
    { key: 'broken_arrow', code: 'Broken Arrow', meaning: 'Distress — major incident immobilizing all Cheetahs', kind: 'emergency' },
]

// ── Canonical call-sign visual language ──────────────────────────────────────
//
// Before this existed, three separate colour maps disagreed: "Cocktail" rendered
// green on My Operations, amber on the Ops Monitor and indigo on the Dashboard.
// An officer who learns a colour on one screen was actively misled on the next.
//
// The rule now: COLOUR ENCODES SEVERITY, FORM (the icon) ENCODES IDENTITY.
//   · Routine movement phases share one calm accent — the label already says
//     which phase it is, so spending colour on identity wastes the only channel
//     that can carry urgency. The icon shows direction instead.
//   · Only genuine exceptions take a status colour, so a glance at a full board
//     answers "is anything wrong?" without reading a single word.
//   · Broken Arrow owns red *exclusively*. Heavy traffic is a delay, not an
//     emergency — if both were red the real emergency would stop standing out.

export type CallSignSeverity = 'idle' | 'active' | 'success' | 'info' | 'warning' | 'critical'

/** Direction of travel, used to pick the icon — identity without spending colour. */
export type CallSignDirection = 'outbound' | 'inbound' | 'transit' | 'arrived' | 'alert' | 'none'

export interface CallSignVisual {
    severity: CallSignSeverity
    direction: CallSignDirection
}

const DEFAULT_VISUAL: CallSignVisual = { severity: 'idle', direction: 'none' }

const CALL_SIGN_VISUALS: Record<string, CallSignVisual> = {
    // Movement phases — calm, identical severity, differentiated by direction icon
    first_course: { severity: 'active', direction: 'outbound' },
    cocktail: { severity: 'active', direction: 'transit' },
    dessert: { severity: 'active', direction: 'inbound' },
    // Arrival at the Theatre gate is the goal state of an outbound run
    chapman: { severity: 'success', direction: 'arrived' },

    // Live broadcasts — these are the exceptions that must catch the eye
    blue_cocktail: { severity: 'info', direction: 'transit' },
    red_cocktail: { severity: 'warning', direction: 'transit' },
    re_order: { severity: 'info', direction: 'transit' },

    // Emergency — sole owner of red
    broken_arrow: { severity: 'critical', direction: 'alert' },

    // Lifecycle states (journeys.status values that aren't SITREP codes)
    planned: { severity: 'idle', direction: 'none' },
    scheduled: { severity: 'idle', direction: 'none' },
    completed: { severity: 'success', direction: 'arrived' },
    cancelled: { severity: 'idle', direction: 'none' },
}

export const getCallSignVisual = (key: string | null | undefined): CallSignVisual =>
    (key && CALL_SIGN_VISUALS[key]) || DEFAULT_VISUAL

/** Tailwind classes per severity — solid fill, for primary status badges. */
export const SEVERITY_SOLID: Record<CallSignSeverity, string> = {
    idle: 'bg-muted text-muted-foreground border-transparent',
    active: 'bg-primary text-primary-foreground border-transparent',
    success: 'bg-success text-success-foreground border-transparent',
    info: 'bg-info text-info-foreground border-transparent',
    warning: 'bg-warning text-warning-foreground border-transparent',
    critical: 'bg-destructive text-destructive-foreground border-transparent',
}

/** Tinted/low-emphasis variant — for secondary chips that shouldn't shout. */
export const SEVERITY_SOFT: Record<CallSignSeverity, string> = {
    idle: 'bg-muted/60 text-muted-foreground border-border',
    active: 'bg-primary/10 text-primary border-primary/25',
    success: 'bg-success/10 text-success border-success/25',
    info: 'bg-info/10 text-info border-info/25',
    warning: 'bg-warning/10 text-warning border-warning/30',
    critical: 'bg-destructive/10 text-destructive border-destructive/30',
}
