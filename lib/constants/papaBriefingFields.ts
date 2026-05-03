/**
 * Defines which Papa fields each Oscar role can VIEW and EDIT (team leads only).
 * Uses only existing `papas` table columns — no new fields required.
 */

export type PapaField = {
  key: string
  label: string
  type: 'text' | 'boolean' | 'select' | 'textarea' | 'datetime' | 'number' | 'jsonb'
  options?: string[] // for select
  hint?: string
}

export type RoleBriefingConfig = {
  /** Human-readable section title shown on the Oscar's page */
  sectionTitle: string
  /** Short description of what this Oscar manages */
  description: string
  /** All fields this role CAN SEE */
  viewFields: PapaField[]
  /** Fields this role's TEAM LEAD can also edit (subset of viewFields) */
  editableFields: string[] // list of field keys
}

// ── Field definitions ────────────────────────────────────────────────────────

const MIC_PREF_OPTIONS = ['Lapel / Lavalier', 'Handheld', 'Headset', 'Podium / Fixed', 'No preference']
const WATER_TEMP_OPTIONS = ['Room temperature', 'Cold', 'Warm', 'Hot']

const ECHO_FIELDS: PapaField[] = [
  { key: 'mic_preference',      label: 'Microphone Preference',  type: 'select',   options: MIC_PREF_OPTIONS },
  { key: 'presentation_style',  label: 'Presentation Style',     type: 'text',     hint: 'e.g. Seated, Pacing, Podium-only' },
  { key: 'has_slides',          label: 'Has Presentation Slides', type: 'boolean' },
  { key: 'uses_stage_props',    label: 'Uses Stage Props',        type: 'boolean' },
  { key: 'speaking_schedule',   label: 'Speaking Schedule',       type: 'jsonb' },
  { key: 'special_requirements',label: 'Special Requirements',    type: 'textarea' },
]

const NOSCAR_NEST_FIELDS: PapaField[] = [
  { key: 'accommodation_preferences', label: 'Room/Accommodation Preferences', type: 'textarea' },
  { key: 'accommodations',            label: 'Assigned Accommodation',          type: 'text' },
  { key: 'entourage_size',            label: 'Entourage Size',                  type: 'number' },
  { key: 'entourage_count',           label: 'Entourage Count (official)',       type: 'number' },
  { key: 'personal_assistants',       label: 'Personal Assistants / PAs',       type: 'jsonb' },
  { key: 'special_requirements',      label: 'Special Requirements',            type: 'textarea' },
]

const NOSCAR_DEN_FIELDS: PapaField[] = [
  { key: 'food_preferences',    label: 'Food Preferences',          type: 'textarea' },
  { key: 'dietary_restrictions',label: 'Dietary Restrictions',      type: 'textarea' },
  { key: 'needs_water_on_stage',label: 'Water on Stage',            type: 'boolean' },
  { key: 'water_temperature',   label: 'Water Temperature',         type: 'select', options: WATER_TEMP_OPTIONS },
  { key: 'needs_face_towels',   label: 'Needs Face Towels',         type: 'boolean' },
  { key: 'entourage_size',      label: 'Entourage Size',            type: 'number' },
  { key: 'entourage_count',     label: 'Entourage Count (official)', type: 'number' },
  { key: 'special_requirements',label: 'Special Requirements',      type: 'textarea' },
]

const VICTOR_FIELDS: PapaField[] = [
  { key: 'speaking_schedule',   label: 'Speaking Schedule',         type: 'jsonb' },
  { key: 'needs_water_on_stage',label: 'Water on Stage',            type: 'boolean' },
  { key: 'needs_face_towels',   label: 'Needs Face Towels',         type: 'boolean' },
  { key: 'uses_stage_props',    label: 'Uses Stage Props',          type: 'boolean' },
  { key: 'special_requirements',label: 'Special Requirements',      type: 'textarea' },
]

const ALPHA_FIELDS: PapaField[] = [
  { key: 'flight_number',         label: 'Flight Number',    type: 'text' },
  { key: 'airline',               label: 'Airline',          type: 'text' },
  { key: 'flight_provider',       label: 'Flight Provider',  type: 'text' },
  { key: 'flight_arrival_time',   label: 'Arrival Time',     type: 'datetime' },
  { key: 'flight_departure_time', label: 'Departure Time',   type: 'datetime' },
  { key: 'arrival_country',       label: 'Arrival Country',  type: 'text' },
  { key: 'arrival_city',          label: 'Arrival City',     type: 'text' },
  { key: 'arrival_date',          label: 'Arrival Date',     type: 'text' },
  { key: 'departure_date',        label: 'Departure Date',   type: 'text' },
  { key: 'passport_number',       label: 'Passport Number',  type: 'text' },
  { key: 'entourage_size',        label: 'Entourage Size',   type: 'number' },
  { key: 'special_requirements',  label: 'Special Requirements', type: 'textarea' },
]

const DELTA_FIELDS: PapaField[] = [
  { key: 'entourage_size',        label: 'Entourage Size',           type: 'number' },
  { key: 'entourage_count',       label: 'Entourage Count (official)',type: 'number' },
  { key: 'personal_assistants',   label: 'Personal Assistants / PAs',type: 'jsonb' },
  { key: 'special_requirements',  label: 'Special Requirements',     type: 'textarea' },
]

// ── Role → Config map ────────────────────────────────────────────────────────

export const ROLE_BRIEFING_CONFIG: Record<string, RoleBriefingConfig> = {
  // Echo Oscar — Sound/AV/Tech
  echo_oscar: {
    sectionTitle: 'Papa AV Briefings',
    description: 'Microphone, slides, and presentation preferences for each Papa',
    viewFields: ECHO_FIELDS,
    editableFields: [],
  },
  head_echo_oscar: {
    sectionTitle: 'Papa AV Briefings',
    description: 'Microphone, slides, and presentation preferences for each Papa',
    viewFields: ECHO_FIELDS,
    editableFields: ['mic_preference', 'presentation_style', 'has_slides', 'uses_stage_props'],
  },

  // NOScar Nest — Accommodation / Hosting at the Nest
  noscar_nest: {
    sectionTitle: 'Papa Nest Briefings',
    description: 'Accommodation preferences and entourage details for each Papa',
    viewFields: NOSCAR_NEST_FIELDS,
    editableFields: [],
  },
  head_noscar_nest: {
    sectionTitle: 'Papa Nest Briefings',
    description: 'Accommodation preferences and entourage details for each Papa',
    viewFields: NOSCAR_NEST_FIELDS,
    editableFields: ['accommodation_preferences', 'accommodations', 'entourage_size', 'special_requirements'],
  },

  // NOScar Theatre/Den — Food & hospitality at the Theatre
  noscar_den: {
    sectionTitle: 'Papa Hospitality Briefings',
    description: 'Food, dietary and stage hospitality needs for each Papa',
    viewFields: NOSCAR_DEN_FIELDS,
    editableFields: [],
  },
  head_noscar_den: {
    sectionTitle: 'Papa Hospitality Briefings',
    description: 'Food, dietary and stage hospitality needs for each Papa',
    viewFields: NOSCAR_DEN_FIELDS,
    editableFields: ['food_preferences', 'dietary_restrictions', 'needs_water_on_stage', 'water_temperature', 'needs_face_towels'],
  },

  // November Oscar — sees both nest + den fields (read-only)
  november_oscar: {
    sectionTitle: 'Papa NOScar Briefings',
    description: 'Full hospitality & accommodation briefing for each Papa',
    viewFields: [...NOSCAR_NEST_FIELDS, ...NOSCAR_DEN_FIELDS],
    editableFields: [],
  },

  // Victor Oscar — Theatre / Venue
  victor_oscar: {
    sectionTitle: 'Papa Venue Briefings',
    description: 'Stage and venue requirements for each Papa',
    viewFields: VICTOR_FIELDS,
    editableFields: [],
  },
  head_victor_oscar: {
    sectionTitle: 'Papa Venue Briefings',
    description: 'Stage and venue requirements for each Papa',
    viewFields: VICTOR_FIELDS,
    editableFields: ['speaking_schedule', 'needs_water_on_stage', 'needs_face_towels'],
  },

  // Alpha Oscar — Airport / Eagle Square
  alpha_oscar: {
    sectionTitle: 'Papa Arrival Briefings',
    description: 'Flight details and airport logistics for each Papa',
    viewFields: ALPHA_FIELDS,
    editableFields: [],
  },
  head_alpha_oscar: {
    sectionTitle: 'Papa Arrival Briefings',
    description: 'Flight details and airport logistics for each Papa',
    viewFields: ALPHA_FIELDS,
    editableFields: ['flight_number', 'airline', 'flight_provider', 'flight_arrival_time', 'flight_departure_time'],
  },

  // Delta Oscar — Transport
  delta_oscar: {
    sectionTitle: 'Papa Transport Briefings',
    description: 'Entourage and transport details for each Papa',
    viewFields: DELTA_FIELDS,
    editableFields: [],
  },
  // Tango Oscar — same as delta but read-only
  tango_oscar: {
    sectionTitle: 'Papa Transport Briefings',
    description: 'Entourage and transport details for each Papa',
    viewFields: DELTA_FIELDS,
    editableFields: [],
  },
  head_tango_oscar: {
    sectionTitle: 'Papa Transport Briefings',
    description: 'Entourage and transport details for each Papa',
    viewFields: DELTA_FIELDS,
    editableFields: [],
  },
}

/** Returns field config for a role, or null if this role has no briefing */
export function getBriefingConfig(role: string): RoleBriefingConfig | null {
  return ROLE_BRIEFING_CONFIG[role] ?? null
}

/** True if this role can edit any Papa fields */
export function canEditBriefing(role: string): boolean {
  return (ROLE_BRIEFING_CONFIG[role]?.editableFields?.length ?? 0) > 0
}

/** Returns the set of field keys that admins / non-Oscar roles should not override via this API */
export const ALL_OSCAR_EDITABLE_FIELDS = new Set(
  Object.values(ROLE_BRIEFING_CONFIG).flatMap(c => c.editableFields)
)
