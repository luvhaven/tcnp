// Both a primary-Papa FK and the journey_papas join table connect these tables.
// Explicitly choose the primary Papa so PostgREST does not reject the embed.
export const DASHBOARD_JOURNEY_SELECT = '*, papas!journeys_papa_id_fkey(full_name, title), cheetahs(call_sign, registration_number)'
