'use client'

import { useState } from 'react'
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
    { key: 'logistics_notes', label: 'Logistics Notes', placeholder: 'Any issues with Cheetah, route, timing, or pickups?', required: false },
    { key: 'accommodation_notes', label: 'Nest / Accommodation', placeholder: 'Any issues with room, comfort, or hotel services?', required: false },
    { key: 'incidents', label: 'Incidents / Deviations', placeholder: 'Any Broken Arrow situations, emergencies, or deviations from plan?', required: false },
    { key: 'monetary_gifts', label: 'Monetary Gifts Received', placeholder: 'Any gifts received? Note amount, currency, giver, and time. Report to finance.', required: false },
    { key: 'improvements', label: 'Suggestions for Next Time', placeholder: 'What could be improved in future operations?', required: false },
]

export default function DOFeedbackForm({ journeyId, papaNme, onSubmit }: DOFeedbackFormProps) {
    const supabase = createClient()
    const [saving, setSaving] = useState(false)
    const [rating, setRating] = useState('')
    const [fields, setFields] = useState<Record<string, string>>({
        principal_wellbeing: '',
        logistics_notes: '',
        accommodation_notes: '',
        incidents: '',
        monetary_gifts: '',
        improvements: '',
    })

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

            await (supabase as any).from('do_feedback_forms').insert([{
                journey_id: journeyId,
                submitted_by: user.id,
                submitted_by_name: ud?.full_name || user.email,
                overall_rating: rating ? parseInt(rating[0]) : null,
                ...fields,
                submitted_at: new Date().toISOString(),
            }])

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
                <p className="text-[10px] text-muted-foreground mt-0.5">
                    Papa: <span className="font-medium text-foreground">{papaNme}</span>
                </p>
            </CardHeader>
            <CardContent className="p-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Overall Rating */}
                    <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                            <Star className="h-3 w-3 text-yellow-500" />
                            Overall Operation Rating
                        </Label>
                        <Select value={rating} onValueChange={setRating}>
                            <SelectTrigger className="text-xs h-8">
                                <SelectValue placeholder="Select rating…" />
                            </SelectTrigger>
                            <SelectContent>
                                {RATING_OPTIONS.map(r => (
                                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Feedback fields */}
                    {FEEDBACK_FIELDS.map(({ key, label, placeholder, required }) => (
                        <div key={key} className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1">
                                {label}
                                {required && <span className="text-red-500 text-[10px]">*</span>}
                            </Label>
                            <Textarea
                                placeholder={placeholder}
                                value={fields[key]}
                                onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                                className="text-xs min-h-[60px] resize-none"
                                required={required}
                            />
                        </div>
                    ))}

                    <Button type="submit" disabled={saving} className="w-full gap-2 text-xs">
                        <Send className="h-3 w-3" />
                        {saving ? 'Submitting…' : 'Submit Post-Op Report'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
