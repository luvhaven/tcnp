"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Clock, User, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

type ProgramDay = {
    id: string
    date: string
    title: string
}

type ProgramSession = {
    id: string
    day_id: string
    title: string
    session_type: 'morning' | 'afternoon' | 'evening' | 'special'
    start_time: string
    end_time: string
    venue: string
}

type SessionSpeaker = {
    id: string
    session_id: string
    papa_id: string
    topic: string
    time_slot: string
    duration_minutes: number
    is_keynote: boolean
    papas: { full_name: string, title: string }
}

export default function ProgramSchedule({ programId }: { programId: string }) {
    const supabase = createClient()
    const [days, setDays] = useState<ProgramDay[]>([])
    const [sessions, setSessions] = useState<ProgramSession[]>([])
    const [speakers, setSpeakers] = useState<SessionSpeaker[]>([])
    const [papas, setPapas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Dialog States
    const [addDayOpen, setAddDayOpen] = useState(false)
    const [addSessionOpen, setAddSessionOpen] = useState(false)
    const [addSpeakerOpen, setAddSpeakerOpen] = useState(false)

    // Selection States
    const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

    // Forms
    const [dayForm, setDayForm] = useState({ date: '', title: '' })
    const [sessionForm, setSessionForm] = useState({
        title: '',
        session_type: 'morning',
        start_time: '',
        end_time: '',
        venue: ''
    })
    const [speakerForm, setSpeakerForm] = useState({
        papa_id: '',
        topic: '',
        time_slot: '',
        duration_minutes: 30,
        is_keynote: false
    })

    useEffect(() => {
        loadData()
    }, [programId])

    const loadData = async () => {
        try {
            const [daysRes, sessionsRes, speakersRes, papasRes] = await Promise.all([
                (supabase as any).from('program_days').select('*').eq('program_id', programId).order('date'),
                (supabase as any).from('program_sessions').select('*').order('start_time'),
                (supabase as any).from('session_speakers').select('*, papas(full_name, title)').order('time_slot'),
                (supabase as any).from('papas').select('id, full_name, title').order('full_name')
            ])

            if (daysRes.data) {
                setDays(daysRes.data)
                if (daysRes.data.length > 0 && !selectedDayId) {
                    setSelectedDayId(daysRes.data[0].id)
                }
            }
            if (sessionsRes.data) setSessions(sessionsRes.data as any)
            if (speakersRes.data) setSpeakers(speakersRes.data as any)
            if (papasRes.data) setPapas(papasRes.data)
        } catch (error) {
            console.error('Error loading schedule:', error)
            toast.error('Failed to load schedule')
        } finally {
            setLoading(false)
        }
    }

    const handleAddDay = async () => {
        try {
            const { error } = await (supabase as any).from('program_days').insert([{ ...dayForm, program_id: programId }])
            if (error) throw error
            toast.success('Day added')
            setAddDayOpen(false)
            setDayForm({ date: '', title: '' })
            loadData()
        } catch (error) {
            toast.error('Failed to add day')
        }
    }

    const handleAddSession = async () => {
        if (!selectedDayId) return
        try {
            const { error } = await (supabase as any).from('program_sessions').insert([{ ...sessionForm, day_id: selectedDayId }])
            if (error) throw error
            toast.success('Session added')
            setAddSessionOpen(false)
            setSessionForm({ title: '', session_type: 'morning', start_time: '', end_time: '', venue: '' })
            loadData()
        } catch (error) {
            toast.error('Failed to add session')
        }
    }

    const handleAddSpeaker = async () => {
        if (!selectedSessionId) return
        try {
            const { error } = await (supabase as any).from('session_speakers').insert([{ ...speakerForm, session_id: selectedSessionId }])
            if (error) throw error
            toast.success('Speaker assigned')
            setAddSpeakerOpen(false)
            setSpeakerForm({ papa_id: '', topic: '', time_slot: '', duration_minutes: 30, is_keynote: false })
            loadData()
        } catch (error) {
            toast.error('Failed to assign speaker')
        }
    }

    const handleDelete = async (table: string, id: string) => {
        if (!confirm('Are you sure?')) return
        try {
            const { error } = await (supabase as any).from(table).delete().eq('id', id)
            if (error) throw error
            toast.success('Deleted successfully')
            loadData()
        } catch (error) {
            toast.error('Failed to delete')
        }
    }

    const getSessionsForDay = (dayId: string) => sessions.filter(s => s.day_id === dayId)
    const getSpeakersForSession = (sessionId: string) => speakers.filter(s => s.session_id === sessionId)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Program Schedule</h3>
                <Button size="sm" onClick={() => setAddDayOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Day
                </Button>
                <Dialog open={addDayOpen} onOpenChange={setAddDayOpen}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Add Program Day</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="date" value={dayForm.date} onChange={e => setDayForm({ ...dayForm, date: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Title (Optional)</Label>
                                <Input placeholder="e.g. Opening Day" value={dayForm.title} onChange={e => setDayForm({ ...dayForm, title: e.target.value })} />
                            </div>
                            <Button onClick={handleAddDay} className="w-full">Add Day</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {days.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No days scheduled yet.</div>
            ) : (
                <Tabs value={selectedDayId || undefined} onValueChange={setSelectedDayId} className="w-full">
                    <TabsList className="w-full justify-start overflow-x-auto">
                        {days.map(day => (
                            <TabsTrigger key={day.id} value={day.id}>
                                {new Date(day.date).toLocaleDateString()} {day.title && `- ${day.title}`}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {days.map(day => (
                        <TabsContent key={day.id} value={day.id} className="space-y-4 mt-4">
                            <div className="flex justify-between items-center">
                                <h4 className="font-medium">Sessions for {new Date(day.date).toLocaleDateString()}</h4>
                                <Button variant="outline" size="sm" onClick={() => setAddSessionOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Session
                                </Button>
                                <Dialog open={addSessionOpen} onOpenChange={setAddSessionOpen}>
                                    <DialogContent>
                                        <DialogHeader><DialogTitle>Add Session</DialogTitle></DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label>Title</Label>
                                                <Input placeholder="e.g. Morning Worship" value={sessionForm.title} onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Start Time</Label>
                                                    <Input type="time" value={sessionForm.start_time} onChange={e => setSessionForm({ ...sessionForm, start_time: e.target.value })} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>End Time</Label>
                                                    <Input type="time" value={sessionForm.end_time} onChange={e => setSessionForm({ ...sessionForm, end_time: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Type</Label>
                                                <select
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={sessionForm.session_type}
                                                    onChange={e => setSessionForm({ ...sessionForm, session_type: e.target.value as any })}
                                                >
                                                    <option value="morning">Morning</option>
                                                    <option value="afternoon">Afternoon</option>
                                                    <option value="evening">Evening</option>
                                                    <option value="special">Special</option>
                                                </select>
                                            </div>
                                            <Button onClick={handleAddSession} className="w-full">Add Session</Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="grid gap-4">
                                {getSessionsForDay(day.id).map(session => (
                                    <Card key={session.id}>
                                        <CardHeader className="pb-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <CardTitle className="text-lg">{session.title}</CardTitle>
                                                    <CardDescription className="flex items-center gap-2 mt-1">
                                                        <Clock className="h-3 w-3" /> {session.start_time.slice(0, 5)} - {session.end_time.slice(0, 5)}
                                                        <Badge variant="secondary" className="ml-2">{session.session_type}</Badge>
                                                    </CardDescription>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => {
                                                        setSelectedSessionId(session.id)
                                                        setAddSpeakerOpen(true)
                                                    }}>
                                                        <User className="h-4 w-4 mr-1" /> Add Speaker
                                                    </Button>

                                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete('program_sessions', session.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {getSpeakersForSession(session.id).length === 0 ? (
                                                    <p className="text-sm text-muted-foreground italic">No speakers assigned</p>
                                                ) : (
                                                    getSpeakersForSession(session.id).map(speaker => (
                                                        <div key={speaker.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                                    {speaker.papas?.full_name?.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium">{speaker.papas?.title} {speaker.papas?.full_name}</p>
                                                                    <p className="text-xs text-muted-foreground">{speaker.topic} • {speaker.time_slot?.slice(0, 5)} ({speaker.duration_minutes}m)</p>
                                                                </div>
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete('session_speakers', speaker.id)}>
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            )}

            <Dialog open={addSpeakerOpen} onOpenChange={setAddSpeakerOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Assign Speaker</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Papa (Speaker)</Label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={speakerForm.papa_id}
                                onChange={e => setSpeakerForm({ ...speakerForm, papa_id: e.target.value })}
                            >
                                <option value="">Select Speaker</option>
                                {papas.map(p => (
                                    <option key={p.id} value={p.id}>{p.title} {p.full_name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Topic</Label>
                            <Input placeholder="Topic of speech" value={speakerForm.topic} onChange={e => setSpeakerForm({ ...speakerForm, topic: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Time Slot</Label>
                                <Input type="time" value={speakerForm.time_slot} onChange={e => setSpeakerForm({ ...speakerForm, time_slot: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Duration (mins)</Label>
                                <Input type="number" value={speakerForm.duration_minutes} onChange={e => setSpeakerForm({ ...speakerForm, duration_minutes: parseInt(e.target.value) })} />
                            </div>
                        </div>
                        <Button onClick={handleAddSpeaker} className="w-full">Assign Speaker</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
