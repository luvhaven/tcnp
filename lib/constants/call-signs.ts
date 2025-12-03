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
