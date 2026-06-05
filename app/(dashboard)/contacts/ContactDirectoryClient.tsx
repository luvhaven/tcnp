'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, MapPin, Radio, Users, Globe } from 'lucide-react'

interface Contact {
    name: string
    role: string
    category: string
    phone?: string
    email?: string
    location?: string
    notes?: string
}

// These contacts should be updated by Command Centre admins
// For now they show the roles and placeholder guidance per SOP
const CONTACT_GROUPS: { label: string; icon: React.ReactNode; color: string; contacts: Contact[] }[] = [
    {
        label: 'Command Centre',
        icon: <Radio className="h-4 w-4" />,
        color: 'text-primary',
        contacts: [
            { name: 'Head of Operations', role: 'HOO', category: 'Command', notes: 'Primary command authority during operations' },
            { name: 'Head of Command', role: 'HOC', category: 'Command', notes: 'Strategic oversight and final escalation point' },
            { name: 'Captain', role: 'Captain', category: 'Command', notes: 'On-ground operational lead' },
        ],
    },
    {
        label: 'Delta Oscar Team',
        icon: <Users className="h-4 w-4" />,
        color: 'text-amber-500',
        contacts: [
            { name: 'Head Delta Oscar', role: 'Head DO', category: 'DO', notes: 'Leads all Duty Officers — escalate issues here first' },
            { name: 'Duty Officer Pool', role: 'Delta Oscar', category: 'DO', notes: 'Contact assigned DO via journey record or chat' },
        ],
    },
    {
        label: 'Mike Uniform (Sound)',
        icon: <Radio className="h-4 w-4" />,
        color: 'text-violet-500',
        contacts: [
            { name: 'Mike Uniform Lead', role: 'Sound / Media', category: 'MU', notes: 'Liaise before any program for mic placement, A/V setup. Echo Oscar always coordinates with MU.' },
        ],
    },
    {
        label: 'Traffic Uniform',
        icon: <MapPin className="h-4 w-4" />,
        color: 'text-orange-500',
        contacts: [
            { name: 'Traffic Uniform Lead', role: 'TU / Security', category: 'TU', notes: 'Coordinates Cheetah parking at Eagle Square and Den. Victor Oscar liaises with TU.' },
        ],
    },
    {
        label: 'Ushering Team',
        icon: <Users className="h-4 w-4" />,
        color: 'text-sky-500',
        contacts: [
            { name: 'Head Usher', role: 'Ushering', category: 'Ushering', notes: 'Coordinates seating, entry management, and protocol lounge access at Den.' },
        ],
    },
    {
        label: 'External Contacts',
        icon: <Globe className="h-4 w-4" />,
        color: 'text-green-500',
        contacts: [
            { name: 'W2M / Travel Agency', role: 'Travel', category: 'External', notes: 'Handles flights, logistics, and itinerary changes for papa travel.' },
            { name: 'Immigration / Customs', role: 'Government', category: 'External', notes: 'Alpha Oscar maintains contacts. Verify visa status 2 weeks before each arrival.' },
            { name: 'Hotel Manager', role: 'Nest Liaison', category: 'External', notes: 'November Oscar maintains direct relationship with each hotel manager.' },
        ],
    },
]

export default function ContactDirectoryClient() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Phone className="h-7 w-7 text-primary" />
                    Contact Directory
                </h1>
                <p className="text-muted-foreground mt-1">
                    Key TCNP operational contacts per SOP requirement. Admins should update actual phone numbers in Supabase.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {CONTACT_GROUPS.map((group) => (
                    <Card key={group.label} className="border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className={`flex items-center gap-2 text-sm font-semibold ${group.color}`}>
                                {group.icon}
                                {group.label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {group.contacts.map((c, i) => (
                                <div key={i} className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-sm font-medium">{c.name}</span>
                                        <Badge variant="secondary" className="text-[9px] flex-shrink-0">{c.category}</Badge>
                                    </div>
                                    <p className="text-[10px] font-medium text-muted-foreground">{c.role}</p>
                                    {c.phone && (
                                        <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                                            <Phone className="h-3 w-3" />{c.phone}
                                        </a>
                                    )}
                                    {c.email && (
                                        <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                                            <Mail className="h-3 w-3" />{c.email}
                                        </a>
                                    )}
                                    {c.notes && (
                                        <p className="text-[10px] text-muted-foreground leading-snug border-t border-border/30 pt-1.5 mt-1">{c.notes}</p>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="py-4 px-5">
                    <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-amber-600">Admin note:</span> To add real phone numbers and emails, update this directory via the Supabase <code>contacts</code> table or reach out to Command Centre admins. This directory follows SOP requirement for personnel to know their key contacts before any operation.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
