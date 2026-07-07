/**
 * Single source of truth for profile completeness.
 * Weighted so the headshot and core identity fields matter most.
 */

export type ProfileFields = {
  full_name?: string | null
  photo_url?: string | null
  phone?: string | null
  job_title?: string | null
  team?: string | null
  date_of_birth?: string | null
  gender?: string | null
  address?: string | null
  city?: string | null
  bio?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}

export type ProfileFieldSpec = {
  key: keyof ProfileFields
  label: string
  weight: number
  /** Required fields must all be present for the profile to count as "complete" */
  required: boolean
  group: 'identity' | 'personal' | 'emergency'
}

export const PROFILE_FIELD_SPECS: ProfileFieldSpec[] = [
  { key: 'photo_url', label: 'Professional headshot', weight: 3, required: true, group: 'identity' },
  { key: 'full_name', label: 'Full name', weight: 2, required: true, group: 'identity' },
  { key: 'phone', label: 'Phone number', weight: 2, required: true, group: 'identity' },
  { key: 'job_title', label: 'Title / rank', weight: 1, required: false, group: 'identity' },
  { key: 'team', label: 'Protocol team', weight: 2, required: true, group: 'identity' },
  { key: 'date_of_birth', label: 'Date of birth', weight: 1, required: false, group: 'personal' },
  { key: 'gender', label: 'Gender', weight: 1, required: false, group: 'personal' },
  { key: 'city', label: 'City', weight: 1, required: false, group: 'personal' },
  { key: 'address', label: 'Address', weight: 1, required: false, group: 'personal' },
  { key: 'bio', label: 'Short bio', weight: 1, required: false, group: 'personal' },
  { key: 'emergency_contact_name', label: 'Emergency contact name', weight: 2, required: true, group: 'emergency' },
  { key: 'emergency_contact_phone', label: 'Emergency contact phone', weight: 2, required: true, group: 'emergency' },
]

function hasValue(v: unknown): boolean {
  return typeof v === 'string' ? v.trim().length > 0 : v != null
}

export type CompletionResult = {
  /** 0–100 weighted percentage */
  percent: number
  /** all required fields present */
  isComplete: boolean
  filledCount: number
  totalCount: number
  missing: ProfileFieldSpec[]
  missingRequired: ProfileFieldSpec[]
}

export function computeProfileCompletion(profile: ProfileFields | null | undefined): CompletionResult {
  const specs = PROFILE_FIELD_SPECS
  const totalWeight = specs.reduce((s, f) => s + f.weight, 0)

  let filledWeight = 0
  let filledCount = 0
  const missing: ProfileFieldSpec[] = []

  for (const spec of specs) {
    if (hasValue(profile?.[spec.key])) {
      filledWeight += spec.weight
      filledCount += 1
    } else {
      missing.push(spec)
    }
  }

  const missingRequired = missing.filter(f => f.required)

  return {
    percent: Math.round((filledWeight / totalWeight) * 100),
    isComplete: missingRequired.length === 0,
    filledCount,
    totalCount: specs.length,
    missing,
    missingRequired,
  }
}
