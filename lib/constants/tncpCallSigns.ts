export type CallSignCategory =
  | 'unit'
  | 'journey_phase'
  | 'traffic_status'
  | 'alert'
  | 'timing'
  | 'role'
  | 'location'
  | 'equipment'

export type JourneyPhaseCallSignKey = 'first_course' | 'cocktail' | 'chapman' | 'dessert'

export type CallSignKey =
  | 'tango_uniform'
  | 'mike_uniform'
  | 'school'
  | 'eta'
  | 'etd'
  | JourneyPhaseCallSignKey
  | 'blue_cocktail'
  | 'red_cocktail'
  | 're_order'
  | 'broken_arrow'
  | 'prof'
  | 'duchess'
  | 'tcnp'
  | 'captain'
  | 'hod'
  | 'hop'
  | 'tango_oscar'
  | 'echo_oscar'
  | 'victor_oscar'
  | 'november_oscar'
  | 'alpha_oscar'
  | 'delta_oscar'
  | 'theatre'
  | 'den'
  | 'vip_lounge'
  | 'mount_sinai'
  | 'nest'
  | 'cave'
  | 'eagle_square'
  | 'eagle'
  | 'cheetah'

export interface CallSignDefinition {
  readonly code: CallSignKey
  readonly label: string
  readonly description: string
  readonly category: CallSignCategory
  readonly tags?: readonly string[]
}

export const TNCP_CALL_SIGNS: Record<CallSignKey, CallSignDefinition> = {
  prof: {
    code: 'prof',
    label: 'Prof',
    description: 'Senior Pastor',
    category: 'role'
  },
  duchess: {
    code: 'duchess',
    label: 'Duchess',
    description: "Senior Pastor's Wife",
    category: 'role'
  },
  tcnp: {
    code: 'tcnp',
    label: 'TCNP',
    description: 'The Covenant Nation Protocol Department/ Unit',
    category: 'unit'
  },
  captain: {
    code: 'captain',
    label: 'Captain',
    description: 'The head of department of TCNP',
    category: 'role'
  },
  hod: {
    code: 'hod',
    label: 'HOD',
    description: 'The head of department of protocol unit of The Covenant Nation',
    category: 'role'
  },
  hop: {
    code: 'hop',
    label: 'HOP',
    description: 'Head of operation. Protocol member responsible for overseeing an entire operation.',
    category: 'role'
  },
  tango_oscar: {
    code: 'tango_oscar',
    label: 'Tango Oscar (TO)',
    description: 'The transport officer saddled with the responsibility of overseeing vehicular adequacy.',
    category: 'role'
  },
  echo_oscar: {
    code: 'echo_oscar',
    label: 'Echo Oscar (EO)',
    description: 'The equipment officer saddled with the responsibility of ensuring all tools/equipment are optimally functional',
    category: 'role'
  },
  victor_oscar: {
    code: 'victor_oscar',
    label: 'Victor Oscar (VO)',
    description: 'The venue officer responsible for smooth operations at the venue of any program',
    category: 'role'
  },
  november_oscar: {
    code: 'november_oscar',
    label: 'November Oscar (NO)',
    description: 'The nest officer responsible for flawless reception at the hotels',
    category: 'role'
  },
  alpha_oscar: {
    code: 'alpha_oscar',
    label: 'Alpha Oscar (AO)',
    description: 'The Eagle Square officer(s) responsible for flawless reception at the Eagle Squares',
    category: 'role'
  },
  delta_oscar: {
    code: 'delta_oscar',
    label: 'Deltas (DO)',
    description: 'Details assigned to guests for an event',
    category: 'role'
  },
  // Note: 'papa' key is not in the original list but 'papas' is described. 
  // We keep 'prof' and 'duchess' as specific roles, but generic guests are Papas.
  // The images don't explicitly have a 'papa' call sign key, but describe "Papa(s)".

  theatre: {
    code: 'theatre',
    label: 'Theatre',
    description: 'Any of the church locations or any assigned event location',
    category: 'location'
  },
  den: {
    code: 'den',
    label: 'Den',
    description: 'The main church lounge',
    category: 'location'
  },
  vip_lounge: {
    code: 'vip_lounge',
    label: 'VIP Lounge',
    description: 'Any other lounge within the Theatre',
    category: 'location'
  },
  mount_sinai: {
    code: 'mount_sinai',
    label: 'Mount Sinai',
    description: 'The pulpit',
    category: 'location'
  },
  nest: {
    code: 'nest',
    label: 'Nest',
    description: 'The hotel(s) where guests are to be accommodated',
    category: 'location'
  },
  cave: {
    code: 'cave',
    label: 'Cave',
    description: 'The hotel room(s) assigned for any movement',
    category: 'location'
  },
  eagle_square: {
    code: 'eagle_square',
    label: 'Eagle Square',
    description: 'The eagle square where the aircraft(s) would be landing',
    category: 'location'
  },
  eagle: {
    code: 'eagle',
    label: 'Eagle',
    description: 'The aircraft used as means of transportation',
    category: 'equipment'
  },
  cheetah: {
    code: 'cheetah',
    label: 'Cheetah',
    description: 'The vehicle for transporting guests',
    category: 'equipment'
  },
  tango_uniform: {
    code: 'tango_uniform',
    label: 'Tango Uniform',
    description: 'The traffic unit of The Covenant Nation',
    category: 'unit'
  },
  mike_uniform: {
    code: 'mike_uniform',
    label: 'Mike Uniform',
    description: 'The media unit of The Covenant Nation',
    category: 'unit'
  },
  school: {
    code: 'school',
    label: 'School',
    description: 'The church office of The Covenant Nation',
    category: 'location'
  },
  eta: {
    code: 'eta',
    label: 'ETA',
    description: 'The estimated time of arrival for any movement',
    category: 'timing'
  },
  etd: {
    code: 'etd',
    label: 'ETD',
    description: 'The estimated time of departure for any movement',
    category: 'timing'
  },
  first_course: {
    code: 'first_course',
    label: 'First Course',
    description: 'Departure from Nest to Theatre',
    category: 'journey_phase',
    tags: ['journey']
  },
  dessert: {
    code: 'dessert',
    label: 'Dessert',
    description: 'Departure from Theatre to Nest',
    category: 'journey_phase',
    tags: ['journey']
  },
  cocktail: {
    code: 'cocktail',
    label: 'Cocktail',
    description: 'Principal In-transit',
    category: 'journey_phase',
    tags: ['journey']
  },
  blue_cocktail: {
    code: 'blue_cocktail',
    label: 'Blue Cocktail',
    description: 'Mild traffic',
    category: 'traffic_status'
  },
  red_cocktail: {
    code: 'red_cocktail',
    label: 'Red Cocktail',
    description: 'Heavy Traffic',
    category: 'traffic_status'
  },
  re_order: {
    code: 're_order',
    label: 'Re-order',
    description: 'Route Change',
    category: 'journey_phase'
  },
  chapman: {
    code: 'chapman',
    label: 'Chapman',
    description: 'Arrival at Theatre gate',
    category: 'journey_phase',
    tags: ['journey']
  },
  broken_arrow: {
    code: 'broken_arrow',
    label: 'Broken Arrow',
    description: 'Distress call for major incident while transporting the Principal that immobilizes all the cheetahs',
    category: 'alert',
    tags: ['emergency']
  }
}

export const TNCP_JOURNEY_PHASE_KEYS: JourneyPhaseCallSignKey[] = [
  'first_course',
  'cocktail',
  'chapman',
  'dessert'
]

export const TNCP_TRAFFIC_STATUS_KEYS: CallSignKey[] = ['blue_cocktail', 'red_cocktail']

export const TNCP_ALERT_KEYS: CallSignKey[] = ['broken_arrow']

const normalizeKeyCandidate = (value: string): CallSignKey | undefined => {
  if (!value) return undefined

  const trimmed = value.trim()
  const direct = trimmed as CallSignKey
  if (direct in TNCP_CALL_SIGNS) {
    return direct
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') as CallSignKey

  return normalized in TNCP_CALL_SIGNS ? normalized : undefined
}

export const resolveCallSignKey = (value: string | null | undefined): CallSignKey | undefined =>
  value ? normalizeKeyCandidate(value) : undefined

export const getCallSignDefinition = (value: string | null | undefined): CallSignDefinition | undefined => {
  const key = resolveCallSignKey(value)
  return key ? TNCP_CALL_SIGNS[key] : undefined
}

export const getCallSignLabel = (value: string | null | undefined): string | undefined =>
  getCallSignDefinition(value)?.label

export const TNCP_CALL_SIGN_COLORS: Record<CallSignKey, string> = {
  tango_uniform: 'bg-slate-600 text-white',
  mike_uniform: 'bg-slate-500 text-white',
  school: 'bg-amber-500 text-white',
  eta: 'bg-cyan-600 text-white',
  etd: 'bg-cyan-700 text-white',
  first_course: 'bg-blue-600 text-white hover:bg-blue-700',
  cocktail: 'bg-indigo-600 text-white hover:bg-indigo-700',
  chapman: 'bg-teal-600 text-white hover:bg-teal-700',
  dessert: 'bg-purple-600 text-white hover:bg-purple-700',
  blue_cocktail: 'bg-blue-500 text-white',
  red_cocktail: 'bg-red-500 text-white',
  re_order: 'bg-orange-600 text-white hover:bg-orange-700',
  broken_arrow: 'bg-red-600 text-white hover:bg-red-700 broken-arrow-alert',
  prof: 'bg-gray-700 text-white',
  duchess: 'bg-rose-500 text-white',
  tcnp: 'bg-zinc-700 text-white',
  captain: 'bg-emerald-600 text-white',
  hod: 'bg-emerald-700 text-white',
  hop: 'bg-emerald-800 text-white',
  tango_oscar: 'bg-blue-700 text-white',
  echo_oscar: 'bg-blue-800 text-white',
  victor_oscar: 'bg-blue-900 text-white',
  november_oscar: 'bg-blue-950 text-white',
  alpha_oscar: 'bg-sky-700 text-white',
  delta_oscar: 'bg-sky-800 text-white',
  theatre: 'bg-indigo-500 text-white',
  den: 'bg-indigo-600 text-white',
  vip_lounge: 'bg-indigo-700 text-white',
  mount_sinai: 'bg-amber-600 text-white',
  nest: 'bg-stone-600 text-white',
  cave: 'bg-stone-700 text-white',
  eagle_square: 'bg-slate-700 text-white',
  eagle: 'bg-slate-800 text-white',
  cheetah: 'bg-amber-600 text-white'
}
