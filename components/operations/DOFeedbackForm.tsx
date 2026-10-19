'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ClipboardList, Send, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DOFeedbackFormProps {
    journeyId: string
    papaNme: string
    onSubmit?: () => void
}

const RATING_OPTIONS = ['5 — Excellent', '4 — Good', '3 — Satisfactory', '2 — Needs Improvement', '1 — Poor']

const FEEDBACK_FIELDS = [
    { key: 'principal_wellbeing', label: 'Principal Wellbeing', placeholder: 'How was the principal throughout the journey? Any concerns?', required: true },
    { key: 'what_went_well', label: 'What Went Well', placeholder: 'What were the highlights or smooth parts of the operation?', required: false },
    { key: 'what_didnt_go_as_plan', label: 'What Didn\'t Go As Plan', placeholder: 'Were there delays, vehicle issues, or accommodation problems?', required: false },
    { key: 'team_feedback', label: 'Feedback on Team Members', placeholder: 'How did the Tango, November, or Victor Oscars perform?', required: false },
    { key: 'finance_expenses', label: 'Finance / Expenses / Gifts', placeholder: 'Any expenses incurred or monetary gifts received? State amounts.', required: false },
    { key: 'improvements', label: 'Key Recommendations (Improvements)', placeholder: 'Who? Deadline? What exactly should be improved?', required: false },
    { key: 'incidents', label: 'Additional Notes / Incidents', placeholder: 'Any Broken Arrow situations or other observations.', required: false },
]

const EMPTY_FIELDS: Record<string, string> = {
    principal_wellbeing: '',
    what_went_well: '',
    what_didnt_go_as_plan: '',
    team_feedback: '',
    finance_expenses: '',
    improvements: '',
    incidents: '',
}

// Reports are long and written on a phone after a shift — a reload, a dropped
// tab or an accidental navigation must not lose them. Drafts stay on this
// device only and are cleared once the report is accepted.
const draftKey = (journeyId: string) => `tcnp:do-feedback-draft:${journeyId}`

type Draft = { rating: string; fields: Record<string, string> }

function readDraft(journeyId: string): Draft | null {
    try {
        const raw = window.localStorage.getItem(draftKey(journeyId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<Draft>
        return { rating: parsed.rating ?? '', fields: { ...EMPTY_FIELDS, ...(parsed.fields ?? {}) } }
    } catch {
        return null
    }
}

function clearDraft(journeyId: string) {
    try { window.localStorage.removeItem(draftKey(journeyId)) } catch { /* storage unavailable */ }
}

export default function DOFeedbackForm({ journeyId, papaNme, onSubmit }: DOFeedbackFormProps) {
    const supabase = createClient()
    const [saving, setSaving] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    // Only ever rendered client-side after the page's data load, so reading
    // storage in the initializer cannot cause a hydration mismatch.
    const [initialDraft] = useState(() => (typeof window === 'undefined' ? null : readDraft(journeyId)))
    const [rating, setRating] = useState(initialDraft?.rating ?? '')
    const [fields, setFields] = useState<Record<string, string>>(initialDraft?.fields ?? EMPTY_FIELDS)

    useEffect(() => {
        if (submitted) return
        const hasContent = rating || Object.values(fields).some(v => v.trim())
        try {
            if (hasContent) window.localStorage.setItem(draftKey(journeyId), JSON.stringify({ rating, fields }))
            else window.localStorage.removeItem(draftKey(journeyId))
        } catch { /* storage unavailable — the form still works, just without a draft */ }
    }, [journeyId, rating, fields, submitted])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!fields.principal_wellbeing.trim()) {
            toast.error('Principal wellbeing notes are required')
            return
        }
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')
            const { data: ud } = await supabase.from('users').select('full_name').eq('id', user.id).single()

            const { error } = await (supabase as any).from('do_feedback_forms').insert([{
                journey_id: journeyId,
                submitted_by: user.id,
                submitted_by_name: ud?.full_name || user.email,
                overall_rating: rating ? parseInt(rating[0]) : null,
                ...fields,
                submitted_at: new Date().toISOString(),
            }])
            // 23505 = a report for this journey already exists (double submit or
            // another device) — the officer's obligation is met either way.
            if (error && error.code !== '23505') throw error

            clearDraft(journeyId)
            setSubmitted(true)
            toast.success('Post-operation feedback submitted', { description: 'Report has been logged to Command Centre.' })
            onSubmit?.()
        } catch (err: any) {
            toast.error(err.message || 'Failed to submit feedback')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="border-amber-500/20 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-amber-500/5 to-transparent">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <ClipboardList className="h-4 w-4 text-amber-500" />
                    Post-Operation DO Report
                    <Badge variant="secondary" className="text-[9px] font-mono">TCNP.01.08</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Papa: <span className="font-medium text-foreground">{papaNme}</span>
                </p>
            </CardHeader>
            <CardContent className="p-4">
                {submitted ? (
                    <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">Your report has been submitted successfully.</p>
                ) : <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Overall Rating */}
                    <div className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-1.5">
                            <Star className="h-3 w-3 text-yellow-500" />
                            Overall Operation Rating
                        </Label>
                        <Select value={rating} onValueChange={setRating}>
                            <SelectTrigger className="text-base min-h-11">
                                <SelectValue placeholder="Select rating…" />
                            </SelectTrigger>
                            <SelectContent>
                                {RATING_OPTIONS.map(r => (
                                    <SelectItem key={r} value={r} className="text-base min-h-11">{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Feedback fields */}
                    {FEEDBACK_FIELDS.map(({ key, label, placeholder, required }) => (
                        <div key={key} className="space-y-1.5">
                            <Label htmlFor={`${journeyId}-${key}`} className="text-sm flex items-center gap-1">
                                {label}
                                {required && <span className="text-destructive text-sm" aria-hidden>*</span>}
                            </Label>
                            <Textarea
                                id={`${journeyId}-${key}`}
                                placeholder={placeholder}
                                value={fields[key]}
                                onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                                className="text-base min-h-[88px]"
                                required={required}
                            />
                        </div>
                    ))}

                    <p className="text-sm text-muted-foreground">Draft is saved on this device as you type.</p>
                    <Button type="submit" disabled={saving} className="w-full gap-2 min-h-12 text-base">
                        <Send className="h-4 w-4" />
                        {saving ? 'Submitting…' : 'Submit Post-Op Report'}
                    </Button>
                </form>}
            </CardContent>
        </Card>
    )
}
