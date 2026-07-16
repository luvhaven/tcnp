'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    BookOpen, Search, ChevronRight, Shield, Car, Plane, Hotel, Users,
    Radio, Zap, MapPin, FileText, AlertTriangle, ClipboardList, Mic,
    Clock, CheckSquare, Navigation, Volume2, Landmark, Lock, Star,
    ChevronDown, Info, Terminal
} from 'lucide-react'
import { cn, effectiveOscarRole } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
type SubSection = { heading: string; body?: string; list?: string[]; table?: { cols: string[]; rows: string[][] }; highlight?: string; script?: string[] }
type SOPSection = {
    id: string; title: string; icon: React.ComponentType<any>; color: string; bg: string;
    badge: string; roleGate?: string[]; subsections: SubSection[]
}

// ─── SOP Content (from official TCNP SOP Manual) ─────────────────────────────
const SOP_SECTIONS: SOPSection[] = [
    {
        id: 'call-signs',
        title: 'Protocol Call Signs',
        icon: Radio,
        color: 'text-blue-500', bg: 'bg-blue-500/10',
        badge: 'TCNP.01.01',
        subsections: [
            {
                heading: 'Objective',
                body: 'To ensure that communications on all operations are secure. All team members must use only approved call signs during active operations. Sensitive information must never be spoken plainly over radio or open channels.',
            },
            {
                heading: 'Principal & Location Call Signs',
                table: {
                    cols: ['Call Sign', 'Meaning'],
                    rows: [
                        ['Prof', 'Senior Pastor'],
                        ['Duchess', 'Senior Pastor\'s Wife'],
                        ['Papa(s) / Mama(s)', 'Guest minister(s) for any program'],
                        ['Theatre', 'Any church location / venue'],
                        ['Den', 'Main church lounge'],
                        ['Mount Sinai', 'The pulpit'],
                        ['Nest', 'Hotel(s) where guests are accommodated'],
                        ['Cave', 'Hotel room(s) assigned for any movement'],
                        ['Eagle Square', 'Airport / landing strip for aircraft arrivals'],
                        ['Eagle', 'Aircraft used for transportation'],
                        ['School', 'The church office'],
                    ],
                },
            },
            {
                heading: 'Oscar (Unit) Call Signs',
                table: {
                    cols: ['Call Sign', 'Full Name', 'Responsibility'],
                    rows: [
                        ['TCNP', 'The Covenant Nation Protocol', 'Entire Protocol Department / Unit'],
                        ['Captain', '—', 'Head of Department of TCNP'],
                        ['HOD', 'Head of Department', 'Head of protocol unit of The Covenant Nation'],
                        ['HOP', 'Head of Operations', 'Protocol member overseeing an entire operation'],
                        ['Tango Oscar (TO)', 'Transport Officer', 'Overseeing vehicular adequacy and all Cheetahs'],
                        ['Echo Oscar (EO)', 'Equipment Officer', 'Ensuring all tools/equipment are optimally functional'],
                        ['Victor Oscar (VO)', 'Venue Officer', 'Smooth operations at the event venue'],
                        ['November Oscar (NO)', 'Nest Officer', 'Flawless reception at the hotels'],
                        ['Alpha Oscar (AO)', 'Eagle Square Officer', 'Flawless reception at the Eagle Squares/airports'],
                        ['Delta Oscar (DO)', 'Duty Officer', 'Protocol officer attached to a principal during an operation'],
                        ['Tango Uniform (TU)', 'Traffic Unit', 'The traffic unit of The Covenant Nation'],
                        ['Mike Uniform (MU)', 'Media Unit', 'The media unit of The Covenant Nation'],
                    ],
                },
            },
            {
                heading: 'Vehicle & Transit Call Signs',
                table: {
                    cols: ['Call Sign', 'Meaning'],
                    rows: [
                        ['Cheetah', 'Vehicle assigned for transporting guests/principals'],
                        ['ETA', 'Estimated Time of Arrival for any movement'],
                        ['ETD', 'Estimated Time of Departure for any movement'],
                    ],
                },
            },
            {
                heading: 'Journey Status Call Signs',
                table: {
                    cols: ['Call Sign Code', 'Meaning / When to Use'],
                    rows: [
                        ['First Course', 'Departure from Nest (hotel) to Theatre (venue)'],
                        ['Dessert', 'Departure from Theatre back to Nest'],
                        ['Cocktail', 'Principal currently in transit'],
                        ['Blue Cocktail', 'Mild traffic — slight delay expected'],
                        ['Red Cocktail', 'Heavy traffic — significant delay'],
                        ['Re-order', 'Route change in progress'],
                        ['Chapman', 'Principal arrived at Theatre gate'],
                        ['Broken Arrow 🚨', 'Emergency — major road/security incident. Triggers system-wide alert'],
                    ],
                },
            },
        ],
    },
    {
        id: 'prerequisites',
        title: 'Prerequisites & Etiquette',
        icon: Shield,
        color: 'text-purple-500', bg: 'bg-purple-500/10',
        badge: 'TCNP.01.02',
        subsections: [
            {
                heading: 'Personal Grooming',
                list: [
                    'All Protocol Members must maintain decent haircut / style',
                    'All POs must be well manicured and pedicured',
                    'All POs must maintain good personal hygiene at all times',
                ],
            },
            {
                heading: 'Dress Code',
                list: [
                    'Dress code is as determined for each event',
                    'Each member SHALL have the minimum specified numbers of on-duty apparels',
                    'On-duty apparels must be the same type and kind — made by approved TCNP stylists',
                    'Apparels shall include comfortable black shoes for all POs',
                    'Heavy jewelry is unacceptable',
                    'Make-up SHALL be moderate for all female POs',
                    'Apparels SHALL be clean at all times',
                ],
            },
            {
                heading: 'Communication Standards',
                list: [
                    'All POs SHALL know the VISION OF THE COVENANT NATION',
                    'All POs SHALL enunciate the VISION precisely and concisely without ambiguities',
                    'All POs SHALL enunciate the fundamentals of the CHRISTIAN FAITH as believed in The Covenant Nation without ambiguities',
                    'All POs SHALL enunciate the VISION of the program precisely',
                    'All POs SHALL maintain good communication skills in relation to operations',
                    'All external communications shall be through the HOD via team leaders — line communication must be maintained',
                ],
            },
            {
                heading: 'Arrival Routine Checklist (Cheetah)',
                list: [
                    'Vanity Packs',
                    'Air Fresheners (in each Cheetah)',
                    'Torch',
                    'Umbrellas and Rain Coats (Rainy Season)',
                    'Cooling Bags (1 in each Cheetah)',
                    'Communication Radios (as required)',
                    'Program Brochures',
                    'Appropriate Music CD',
                    'Mints and Sweets (suitably placed for Principals)',
                    'Water (minimum 2 bottles)',
                    'Soda (3 different bottles)',
                ],
            },
            {
                heading: 'Departure Routine Checklist (Cheetah)',
                list: [
                    'Vanity Pack (Handkerchiefs, Sanitizers, Mirrors)',
                    'Torch',
                    'Umbrellas and Rain Coats (Rainy Season)',
                    'Air Fresheners (in each Cheetah)',
                    'Cooling Bags (1 in each Cheetah)',
                    'Communication Radios (as required)',
                    'Program Brochures',
                    'Appropriate Music CD',
                    'Mints and Sweets (suitably placed for Papas)',
                    'Water (minimum 2 bottles)',
                    'Soda (3 different bottles)',
                ],
            },
        ],
    },
    {
        id: 'responsibilities',
        title: 'Oscar Responsibilities',
        icon: Users,
        color: 'text-green-500', bg: 'bg-green-500/10',
        badge: 'TCNP.01.03',
        subsections: [
            {
                heading: 'HOD — Head of Department',
                body: 'Responsible for overall coordination, communication with Double Papa and School. The HOD communicates with external stakeholders and ensures all officers are briefed on their roles before operations. The HOD liaises with command center for timely dissemination of mission-critical information.',
            },
            {
                heading: 'TO — Tango Oscar (Transport Officer)',
                body: 'Responsible for ensuring the required numbers of Cheetahs are available and in good condition, with all prerequisites in place. The TO coordinates drivers, obtains route information, and designs route mapping. The TO may also drive the utility vehicle serving as the backup vehicle.',
            },
            {
                heading: 'EO — Echo Oscar (Equipment Officer)',
                body: 'Responsible for all communication equipment and lighting aids, ensuring their optimal functionality during and after all routines.',
            },
            {
                heading: 'NO — November Oscar (Nest Officer)',
                body: 'Responsible for ensuring hotel keys are collected, rooms pre-checked and correctly assigned, and that Papas are checked into appropriately reserved rooms. November Oscars also serve as the welcoming team at the Nest and provide refreshment and hospitality at the Theatre.',
            },
            {
                heading: 'VO — Victor Oscar (Venue Officer)',
                body: 'Responsible for securing seating arrangements, ensuring seamless Theatre operations, coordinating with Delta Oscars on seating, liaising with Tango Uniform for traffic, and ensuring appropriateness of all venue facilities (toilets, VIP lounges). Also liaises with Mike Uniform regarding microphones and media equipment.',
            },
            {
                heading: 'AO — Alpha Oscar (Airport / Eagle Square Officer)',
                body: 'Responsible for flight information. Coordinates arrangements with security agencies in conjunction with the HOD at the Eagle Square to receive Papas. Ensures all bags and baggage are properly tagged.',
            },
            {
                heading: 'DO — Delta Oscar (Duty Officer)',
                body: 'Protocol officer directly attached to a principal (Papa/Mama) for the entire duration of an operation. The DO handles everything from reception, hotel check-in, transit briefing, Theatre attendance, and departure — always ensuring the principal has everything they need.',
            },
        ],
    },
    {
        id: 'operations-procedures',
        title: 'Operations Procedures',
        icon: ClipboardList,
        color: 'text-orange-500', bg: 'bg-orange-500/10',
        badge: 'TCNP.01.04',
        subsections: [
            {
                heading: 'Arrival Routines',
                list: [
                    'Get flight information 1 week before arrival — HOD / AO',
                    'All arrival routine arrangements with SSS & FAAN must be finalized 24hrs to ETA — HOD / AO',
                    'TO must coordinate with HOD/AO to ensure required Cheetah(s) are available at least 24hrs to ETA',
                    'AO/HOD confirm immigration formalities with Eagle Square ODS 12hrs and again 6hrs to ETA',
                    'AOs must arrive at the Eagle Square at least 2hrs to ETA — confirm actual ETA from airline authorities and ensure prerequisites (radios) are operational',
                    'TO ensures orientation of drivers and escorts + route arrangement is coordinated 1hr to ETA',
                    'On Eagle landing: AO coordinates bag/baggage tagging at arrival lounge and communicates for transport',
                ],
            },
            {
                heading: 'Hospitality Routine (Nest Reception)',
                list: [
                    'NOs must be at the Nest at least 30 minutes to ETA of Eagle',
                    'NO confirms with School on Nest arrangements',
                    'NO communicates with AO to confirm Eagle\'s landing',
                    'NO coordinates Cave inspection (cleanliness etc.) and confirms to AO for baggage tagging',
                    'NO ensures Biscuits are placed in Caves on Eagle\'s landing',
                    'AO communicates to NO at intervals with transport updates and approach positioning',
                    'NOs are responsible for reception of Papas at Nest',
                    'Deltas ensure their Papa\'s bags/baggage are delivered to the appropriate Caves',
                ],
            },
            {
                heading: 'Event Routines',
                list: [
                    'VOs and Deltas shall be at Theatre and Nest respectively 45 minutes to program commencement — for prayer and briefing',
                    'HOD shall communicate ETD for Theatre to all Deltas',
                    'TO communicates Cheetah arrangements to Deltas 30 minutes before program commencement',
                    'VO communicates seating arrangement, entry points, confirms protocol lounge and conveniences',
                    'VO communicates to Deltas the arrival routine (proceeding to Theatre or protocol lounge)',
                    'Deltas communicate departure from Nest to VO and ETA to Theatre — request entry assistance',
                    'VOs ensure seamless entry and assist in reception of Papas at Theatre',
                    'VO is RESPONSIBLE for APPROPRIATE SEATING ARRANGEMENT',
                    'VOs ensure seat reservation for all Deltas',
                    'VO coordinates departure in liaison with TO for seamless exit',
                ],
            },
        ],
    },
    {
        id: 'journey-management',
        title: 'Journey Management (Tango Oscar)',
        icon: Car,
        color: 'text-teal-500', bg: 'bg-teal-500/10',
        badge: 'TCNP.01.05',
        subsections: [
            {
                heading: 'Operational Level Agreements',
                list: [
                    'All Cheetahs must have a mileage not exceeding 35,000 miles',
                    'Situation reports must be given every 15 minutes',
                    'Delta Oscars shall obtain confirmation of vehicle inspection before each operation',
                ],
            },
            {
                heading: 'FLOWER Vehicle Inspection Checklist (48hrs & daily)',
                list: [
                    'F — Fuel: Ascertain fuel consumption',
                    'L — Light: Ensure all lights are functioning / replace blown bulbs',
                    'O — Oil level: Confirm oil levels are optimal',
                    'W — Water: Ascertain water consumption, check for leaks, confirm windshield washer fluid is available',
                    'E — Electrics: Ensure no electrical faults, batteries are optimal; run car in stationary position',
                    'R — Rubber: Ensure tyres are within stipulated shelf life and correctly pressurized',
                ],
            },
            {
                heading: 'Route Audit Requirements',
                list: [
                    'Review all routes to and from Nest/Theatres for road conditions',
                    'Identify Potholes, Diversions, and Alternative routes',
                    'Identify Safe havens and Extraction points',
                    'Identify Detour points (for route changes)',
                    'Calculate ETA in normal conditions and ETA in Traffic situations',
                    'Identify Traffic Conditions and resolution steps for road incidents',
                    'Complete a route audit report and communicate findings to Captain',
                    'Communicate preferred routes to Delta Oscars',
                ],
            },
            {
                heading: 'Principal Briefing Script',
                highlight: 'Use this script when briefing the principal before departure',
                script: [
                    '"Good morning sir/ma, how are you today?"',
                    '"We will be leaving for [DESTINATION] shortly."',
                    '"Our preferred route is [ROUTE] and ETA is [TIME]."',
                    '"However, our travel details may be changed due to traffic feedback from the Hub. Thank you."',
                ],
            },
            {
                heading: 'Situation Report Script',
                highlight: 'Send SITREP to Command Centre every 15 minutes during transit',
                script: [
                    'DEPARTURE FROM NEST:',
                    '"Delta [Principal\'s Name] — First Course, ETA [TIME]"',
                    '',
                    'DEPARTURE FROM THEATRE:',
                    '"Delta [Principal\'s Name] — Dessert, ETA [TIME]"',
                    '',
                    'IN TRANSIT:',
                    '"Delta [Principal\'s Name] — Cocktail / Blue Cocktail / Red Cocktail"',
                    '',
                    'EMERGENCY:',
                    '"BROKEN ARROW — [Brief description of incident]"',
                ],
            },
            {
                heading: 'Road Incident Protocol',
                list: [
                    'If road incident occurs, Principal shall be evacuated WITH security DO and security detail',
                    'An armed officer shall remain with the affected Cheetah',
                    'Principal must NOT be exposed in transit except ALL vehicles are immobilized',
                    'DO shall escalate all road incidents to Command Centre using distress code: "BROKEN ARROW"',
                ],
            },
        ],
    },
    {
        id: 'airport-operations',
        title: 'Airport Operations (Alpha Oscar)',
        icon: Plane,
        color: 'text-sky-500', bg: 'bg-sky-500/10',
        badge: 'TCNP.01.06',
        subsections: [
            {
                heading: 'Operational Requirements',
                list: [
                    'There must be at least TWO AOs at Eagle Square to manage Papa/Mama experience',
                    'Charged, internet-enabled telephones for seamless communication with Command Centre, DOs, TOs, and NOs',
                    'Cover all airport logistic bases: pick-up Cheetah parking points, relationships with airport officials, updated flight plan',
                ],
            },
            {
                heading: 'Pre-Operation Checks',
                list: [
                    'Identify relevant personnel and authorities within Eagle Square — foster good relationships',
                    'Weekly visits to Eagle Square before events, upgraded to bi-weekly within one month to event',
                    'Prepare, obtain and review pre-arrival checklists for all Papas and Mamas in partnership with Command Centre, Captain, HOP and Secretariat',
                ],
            },
            {
                heading: 'During Operation — Arrival',
                list: [
                    'Ensure all AOs adhere to briefing script as approved by Captain and HOP',
                    'Dress-code, appearance and personal hygiene strictly as required',
                    'Devices, telephones, radios and communication apps to update all relevant teams as agreed with Command Centre',
                    'One AO must have emergency contact lists: visa, customs, immigration and partner DOs/TOs',
                    'Only pre-approved clearance and welcome processes may be used — emergency changes must be confirmed through Command Centre to HOP and Captain',
                    'Cheetah parking and pick-up points must be checked and approved daily BEFORE every operation',
                ],
            },
        ],
    },
    {
        id: 'nest-management',
        title: 'Nest Management (November Oscar)',
        icon: Hotel,
        color: 'text-pink-500', bg: 'bg-pink-500/10',
        badge: 'TCNP.01.07',
        subsections: [
            {
                heading: 'Protocol Check-in Procedures',
                table: {
                    cols: ['Procedure', 'Responsible', 'Timeline'],
                    rows: [
                        ['Confirm international guest visa status', 'HOD-AO', '2 weeks before arrival'],
                        ['Confirm immigration status and airport checkpoint requirements', 'HOD-AO', '24 hours before arrival'],
                        ['Confirm hotel reservation', 'HOD-CC', '24 hours before arrival'],
                        ['Perform all hotel room checks', 'NO', '6 hours before guest arrives'],
                        ['Complete comfort checklist', 'NO', '5 hours before guest arrives'],
                        ['Confirm guest arrival time to NO and provide updates', 'AO / NO', 'Continuous'],
                        ['Be on standby to receive guest at Nest', 'NO', 'Time of arrival at Nest'],
                        ['Collect ID and complete guest check-in', 'NO', 'Time of arrival at Nest'],
                        ['Deliver welcome pack, SIM card (if approved), room key and wifi password', 'DO / NO', 'Arrival at Cave'],
                    ],
                },
            },
            {
                heading: 'Comfort Checklist (Tick all before guest arrival)',
                list: [
                    '☐ What floor is the booked room located on?',
                    '☐ Are there any safety concerns with the room?',
                    '☐ Are there any health-related concerns with the room?',
                    '☐ Does the room and floor have a pleasant smell?',
                    '☐ Is the room well ventilated?',
                    '☐ Is the air-conditioning functioning?',
                    '☐ Are the conveniences clean and functional?',
                    '☐ Is the water pressure from shower and faucet correct?',
                    '☐ Is the water pressure in the lavatory appropriate?',
                    '☐ Does the hotel provide working internet services?',
                    '☐ Is the mini-bar stocked?',
                    '☐ Have you checked the closets for left overs?',
                    '☐ Is there a welcome note from the church available?',
                    '☐ Have accessories (flowers, welcome packs) been placed in the room?',
                    '☐ Is room service available for the guest?',
                    '☐ Can food be brought into the hotel?',
                    '☐ Does the room/hotel speak excellence (stains, smells, ambiance, reputation)?',
                ],
            },
        ],
    },
    {
        id: 'delta-oscar',
        title: 'Principal Management (Delta Oscar)',
        icon: Navigation,
        color: 'text-red-500', bg: 'bg-red-500/10',
        badge: 'TCNP.01.08',
        roleGate: ['delta_oscar'],
        subsections: [
            {
                heading: 'DO Responsibilities Overview',
                body: 'Delta Oscars are directly attached to principals throughout an operation. The DO must always ensure the principal is safe, briefed, comfortable, on schedule, and has everything they need. Maintain constant communication with Command Centre.',
            },
            {
                heading: 'Core DO Procedures',
                table: {
                    cols: ['Task', 'Procedure'],
                    rows: [
                        ['Receipt of Principal', 'Receive guest at Eagle Square, Nest, or Theatre as pre-determined. Welcome and introduce yourself using the approved briefing script.'],
                        ['Check-In at Nest', 'Accompany NO to the Cave. Ensure principal is settled. Provide your contact details. Confirm room satisfaction and brief on next trip itinerary including pick-up time, venue, and trip duration.'],
                        ['Hotel Pick-Up', 'Arrive at least 1 hour to pick-up time. Ride in the same Cheetah as the principal at all times. 2nd DO rides in advance Cheetah and communicates with Command Centre.'],
                        ['At the Den (Theatre)', 'Receive food menu and note principal\'s requests. Provide WiFi password. Ensure water, sweets and face towel packs are taken into the auditorium. MIC-up the principal before ministration.'],
                        ['Departure to Eagle Square', 'Communicate ETD to principal 24hrs before. Arrive 1hr ahead. NO manages checkout. Use farewell briefing script at Eagle Square.'],
                        ['During Operations', 'Monetary gifts from principal must be given to department finance team immediately. Fill feedback form within 1 week of operation completion.'],
                    ],
                },
            },
            {
                heading: 'Reception Briefing Script (Arrival)',
                highlight: 'Use when receiving the principal for the first time',
                script: [
                    '"Good morning/afternoon/evening [Title + Name]."',
                    '"Welcome to The Covenant Nation. My name is [Your Name] and I am your assigned Protocol Officer for this visit."',
                    '"We are here to ensure your stay is comfortable and seamless. Please do not hesitate to reach out to me for anything you need."',
                    '"I will be with you throughout your stay. Shall we proceed?"',
                ],
            },
            {
                heading: 'Situation Report (SITREP) — DO obligation every 15 mins',
                highlight: 'Send via Command Centre chat / radio during ALL transits',
                script: [
                    'First Course (Nest → Theatre):',
                    '"Delta [Papa Name] — First Course, ETA [TIME]"',
                    '',
                    'Cocktail (In transit, no issues):',
                    '"Delta [Papa Name] — Cocktail"',
                    '',
                    'Blue Cocktail (Mild traffic):',
                    '"Delta [Papa Name] — Blue Cocktail, [Road Name]"',
                    '',
                    'Red Cocktail (Heavy traffic):',
                    '"Delta [Papa Name] — Red Cocktail, [Road Name], ETA revised to [TIME]"',
                    '',
                    'Re-order (Route change):',
                    '"Delta [Papa Name] — Re-order, diverting via [Alternative Route]"',
                    '',
                    'Chapman (Arrived at Theatre gate):',
                    '"Delta [Papa Name] — Chapman, approaching now"',
                    '',
                    'Dessert (Theatre → Nest):',
                    '"Delta [Papa Name] — Dessert, ETA [TIME]"',
                    '',
                    'EMERGENCY:',
                    '"BROKEN ARROW — [Brief description of situation and location]"',
                ],
            },
            {
                heading: 'DO Post-Operation Feedback Form',
                body: 'Every DO is required to complete and submit a Post Operation Report within 1 week of operation completion. The report covers: Executive Summary, General Evaluation, What Went Well, What Didn\'t Go as Planned, What Required Improvement, Feedback on Team Members, Finance/Gifts received, and Key Recommendations.',
            },
            {
                heading: 'Key DO Rules',
                list: [
                    'A Protocol Officer must be stationed by the principal at ALL times',
                    'Monetary gifts received from the principal must be given to department finance team IMMEDIATELY',
                    'Principal must NOT be exposed in transit except all vehicles are immobilized',
                    'Maintain constant communication with Command Centre during all transits',
                    'DO must ride in the same Cheetah as the principal — not in a separate vehicle',
                    'All road incidents: escalate to Command Centre immediately using distress code "BROKEN ARROW"',
                ],
            },
        ],
    },
    {
        id: 'theatre-management',
        title: 'Theatre Management (Victor Oscar)',
        icon: Landmark,
        color: 'text-amber-500', bg: 'bg-amber-500/10',
        badge: 'TCNP.01.09',
        subsections: [
            {
                heading: 'Key Responsibilities',
                list: [
                    'Coordinate with Tango Uniform (Traffic) to provide unhindered access into and out of Theatre',
                    'Mobilize all Oscars not assigned to principals to welcome Papas at the Den',
                    'Liaise with HOP on bouquet presentations and ensure photographer is available',
                    'Ensure Prof or Duchess is available to welcome principal where necessary (in consultation with Captain)',
                    'Run checklist on all Den facilities before and during each operation — minimum 4 times per day',
                    'Liaise with cleaning services and School for cleaning and toiletries stock replenishment',
                    'Receive seating arrangement from Captain/HOP and liaise with ushers to reserve/block required seats',
                    'Reserved seats must remain vacant unless changed by Prof, Captain, VC, or HOP',
                    'Ensure seat reservation is made for ALL TCNP Oscars during operations',
                    'Liaise with theatre facility manager to ensure all requirements are met',
                    'Make contingency arrangements for special requirements at Mount Sinai, Den, or Theatre',
                    'Liaise with Tango Uniform for reservation of Cheetah park for principal and all TCNP Oscars',
                ],
            },
        ],
    },
    {
        id: 'echo-oscar',
        title: 'Equipment Management (Echo Oscar)',
        icon: Volume2,
        color: 'text-violet-500', bg: 'bg-violet-500/10',
        badge: 'TCNP.01.10',
        subsections: [
            {
                heading: 'Equipment Checklist',
                list: [
                    '☐ Check Mics are available with FULL battery power at Den',
                    '☐ Check DO to ensure right mic has been used on Papa',
                    '☐ Check with Mike Uniform to ensure mic signal is seen and ready',
                    '☐ Check backup handheld mic availability',
                    '☐ Check Umbrellas are available at Den',
                    '☐ Check Umbrellas are available in ALL Cheetahs',
                    '☐ Check Torches are available at Den, Cheetah and with DOs for night operations',
                    '☐ Check temporary communication devices for Papa are working at Den and Cheetah',
                    '☐ Check Internet/Data/WiFi is loaded, working and fully charged at Den and Cheetah at ALL times',
                ],
            },
            {
                heading: 'EO Procedures',
                list: [
                    'Liaise with Mike Uniform to ascertain availability of fully functional microphones',
                    'Receive confirmation of total number of microphones available and label them appropriately',
                    'Receive confirmation of designated mic for principal from Command Centre',
                    'Principals must always be evacuated to the Den for mic setup',
                    'Provide relevant equipment for operations: Torchlights, Umbrellas',
                    'Ensure all Cheetahs are fitted with portable torchlights for emergency lighting during night transit',
                    'Ensure Umbrellas are strategically placed around the Den',
                    'Ensure availability of fully functional radios for operations',
                    'Ensure functional WiFi device in Den and Cheetah with data, fully charged',
                    'Provide temporary communication devices (SIM cards, handsets) for principals to Delta Oscars',
                ],
            },
        ],
    },
    {
        id: 'command-centre',
        title: 'Command Centre Operations',
        icon: Terminal,
        color: 'text-emerald-500', bg: 'bg-emerald-500/10',
        badge: 'TCNP.01.11',
        subsections: [
            {
                heading: 'Objective',
                body: 'To ensure the timely, accurate and seamless transmission of information during operations. The Command Centre is the central hub for all information flow during any TCNP operation.',
            },
            {
                heading: 'Operations Plan — Command Centre Steps',
                list: [
                    '1. Receive notification of scheduled operation from Captain',
                    '2. Review operation to identify operational needs: personnel, Cheetah, Nests, etc.',
                    '3. Discuss requirements with Captain/EXCO for adoption and deployment',
                    '4. Notify identified assets on the operation schedule',
                    '5. Create secured communication platform (chat group) for the operation',
                    '6. Obtain contact details of key officers in all support units: Mike Uniform, Traffic Uniform, Ushering, Sound, W2M, etc.',
                    '7. Relay relevant information to designated officers via the secured chat platform',
                    '8. Coordinate daily debrief to identify learning points',
                ],
            },
            {
                heading: 'After Operations',
                list: [
                    'Engage Oscar team leads/Delta Oscars for debrief/report on activities',
                    'Collate report into a consolidated report for the designated operation',
                    'Forward consolidated report to Captain for review',
                    'Receive feedback from Captain on operation report',
                    'Forward learning points to Oscar team leads for implementation',
                    'Archive report for future reference',
                ],
            },
            {
                heading: 'Critical Success Factors',
                list: [
                    'Good understanding of all operations',
                    'Timely communication of plans from School',
                    'Availability of encrypted communication applications',
                    'Good rapport with relevant stakeholders',
                    'Open communication channel with Prof, School and all Oscars',
                ],
            },
        ],
    },
    {
        id: 'welfare',
        title: 'Welfare',
        icon: Star,
        color: 'text-rose-500', bg: 'bg-rose-500/10',
        badge: 'TCNP.01.12',
        subsections: [
            {
                heading: 'Officer Database',
                list: [
                    'Maintain digital records for all officers: Names, Address, Birthdays, Phone Numbers, Email',
                    'Store data in digital storage files',
                ],
            },
            {
                heading: 'Weekly Prayers',
                list: [
                    'Draw up weekly prayer schedule for officers',
                    'Every Monday: notify all members of the prayer focus for the week',
                    'Every Saturday: moderate the prayer watch for the week',
                    'Note: Prayer watches are organized at the instance of the Captain and before operations',
                ],
            },
            {
                heading: 'Team Visits',
                list: [
                    'Receive notification of child delivery and other life events',
                    'Notify all team members via closed communication platform',
                    'Schedule visit and notify all members',
                    'Forward unit gift/token to the affected officer',
                ],
            },
        ],
    },
    {
        id: 'tcn-vision',
        title: 'TCN Vision & Faith',
        icon: BookOpen,
        color: 'text-cyan-500', bg: 'bg-cyan-500/10',
        badge: 'TCNP.01.14',
        subsections: [
            {
                heading: 'The Covenant Nation Vision',
                highlight: 'Every Protocol Officer must know and be able to enunciate this vision precisely',
                body: '"To teach Christians who they are in Christ Jesus, and how to live a victorious life."',
            },
        ],
    },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function SOPPage() {
    const supabase = createClient()
    const [search, setSearch] = useState('')
    const [active, setActive] = useState('call-signs')
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userOscar, setUserOscar] = useState<string | null>(null)
    const [customDocs, setCustomDocs] = useState<{ id: string, oscar: string, title: string, content: string, doc_type: string }[]>([])
    const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
        // Start with all subsections of the first section expanded
        return new Set(SOP_SECTIONS[0].subsections.map((_, i) => `${SOP_SECTIONS[0].id}-${i}`))
    })

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase.from('users').select('role, oscar').eq('id', user.id).single<{ role: string; oscar: string }>()
            if (data) { setUserRole(data.role); setUserOscar(data.oscar) }

            const { data: docs } = await supabase.from('oscar_documents').select('*')
            if (docs) setCustomDocs(docs)
        }
        void load()
    }, [supabase])

    const dynamicSections = useMemo(() => {
        if (!userRole) return SOP_SECTIONS
        const effective = effectiveOscarRole(userRole, userOscar)
        const matches = customDocs.filter(d => d.oscar === 'all' || d.oscar === effective)

        const sops = matches.filter(d => d.doc_type === 'sop')
        const codes = matches.filter(d => d.doc_type === 'code_of_conduct')

        const custom: SOPSection[] = []
        if (sops.length > 0) {
            custom.push({
                id: 'unit-sops',
                title: 'Unit specific SOPs',
                icon: BookOpen,
                color: 'text-blue-500', bg: 'bg-blue-500/10',
                badge: 'UNIT.SOP',
                subsections: sops.map(s => ({
                    heading: s.title,
                    body: s.content
                }))
            })
        }
        if (codes.length > 0) {
            custom.push({
                id: 'unit-codes',
                title: 'Code of Conduct',
                icon: Shield,
                color: 'text-rose-500', bg: 'bg-rose-500/10',
                badge: 'UNIT.CODE',
                subsections: codes.map(c => ({
                    heading: c.title,
                    body: c.content
                }))
            })
        }
        return [...SOP_SECTIONS, ...custom]
    }, [customDocs, userRole, userOscar])

    // Always show DO section to DOs, admins, captains
    const isDO = userRole === 'delta_oscar'
    const isAdmin = ['super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command'].includes(userRole ?? '')

    const filtered = useMemo(() =>
        dynamicSections.filter(s => {
            if (search === '') return true
            const q = search.toLowerCase()
            return s.title.toLowerCase().includes(q) ||
                s.badge.toLowerCase().includes(q) ||
                s.subsections.some(sub =>
                    sub.heading.toLowerCase().includes(q) ||
                    (sub.body ?? '').toLowerCase().includes(q) ||
                    (sub.list ?? []).some(l => l.toLowerCase().includes(q))
                )
        }),
        [search, dynamicSections]
    )

    const activeSection = dynamicSections.find(s => s.id === active) ?? dynamicSections[0]

    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // When navigating between SOP sections, auto-expand all subsections
    const navigateTo = (id: string) => {
        setActive(id)
        setSearch('')
        const section = dynamicSections.find(s => s.id === id)
        if (section) {
            setExpandedSections(new Set(section.subsections.map((_, i) => `${id}-${i}`)))
        }
    }

    const renderSubsection = (sub: SubSection, i: number) => (
        <div key={i} className="pb-4 last:pb-0">
            {sub.heading && (
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <span className="h-1 w-4 rounded-full bg-primary/60 inline-block" />
                    {sub.heading}
                </h3>
            )}
            {sub.highlight && (
                <div className="text-[11px] uppercase font-bold tracking-widest text-primary/70 mb-2 pl-1">{sub.highlight}</div>
            )}
            {sub.body && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-2">{sub.body}</p>
            )}
            {sub.script && (
                <div className="rounded-xl bg-muted/60 border border-border/50 p-4 font-mono text-xs text-foreground/90 space-y-1">
                    {sub.script.map((line, j) =>
                        line === '' ? <div key={j} className="h-2" /> :
                            line.endsWith(':') ? <div key={j} className="text-primary font-bold mt-1">{line}</div> :
                                <div key={j} className="pl-3 border-l-2 border-primary/30 leading-relaxed">{line}</div>
                    )}
                </div>
            )}
            {sub.list && (
                <ul className="space-y-1.5">
                    {sub.list.map((item, j) => (
                        <li key={j} className={cn(
                            "text-sm text-muted-foreground leading-snug flex gap-2",
                            item.startsWith('☐') ? 'font-mono text-[12px]' : ''
                        )}>
                            {!item.startsWith('☐') && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/50" />}
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            )}
            {sub.table && (
                <div className="overflow-x-auto rounded-xl border border-border/50">
                    <table className="min-w-full text-xs">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border/50">
                                {sub.table.cols.map((col, j) => (
                                    <th key={j} className="px-4 py-2.5 text-left font-semibold text-foreground">{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sub.table.rows.map((row, j) => (
                                <tr key={j} className={cn("border-b border-border/30 last:border-0", j % 2 === 0 ? 'bg-background/40' : 'bg-muted/20')}>
                                    {row.map((cell, k) => (
                                        <td key={k} className={cn("px-4 py-2.5 text-muted-foreground align-top", k === 0 ? 'font-semibold text-foreground whitespace-nowrap' : '')}>{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )

    return (
        <div className="flex h-[calc(100vh-5rem)] gap-4 overflow-hidden page-enter">
            {/* Left sidebar nav */}
            <aside className="hidden w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto md:flex">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Search SOP..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
                </div>

                {/* DO Quick Access Banner */}
                {(isDO || isAdmin) && (
                    <button
                        onClick={() => navigateTo('delta-oscar')}
                        className={cn(
                            "flex items-center gap-2 rounded-xl p-3 text-left text-xs border transition-all",
                            active === 'delta-oscar'
                                ? 'bg-red-500/20 border-red-500/40 text-red-600 dark:text-red-400'
                                : 'bg-red-500/5 border-red-500/20 text-red-600/70 hover:bg-red-500/10'
                        )}
                    >
                        <Navigation className="h-4 w-4 flex-shrink-0" />
                        <div>
                            <div className="font-bold">DO Quick Reference</div>
                            <div className="text-[10px] opacity-70">Scripts, SITREPs & Checklists</div>
                        </div>
                    </button>
                )}

                {/* Nav */}
                <nav className="space-y-0.5">
                    {filtered.map(section => {
                        const Icon = section.icon
                        const isActive = active === section.id
                        return (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => navigateTo(section.id)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors",
                                    isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <div className={cn('rounded-md p-1.5 flex-shrink-0', section.bg)}>
                                    <Icon className={cn('h-3 w-3', section.color)} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="truncate">{section.title}</div>
                                    <div className="text-[9px] opacity-60 font-mono">{section.badge}</div>
                                </div>
                                {isActive && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                            </button>
                        )
                    })}
                </nav>

                {/* Version footer */}
                <div className="mt-auto rounded-xl border bg-muted/30 p-3 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5 mb-1"><FileText className="h-3 w-3" /><span className="font-medium">TCNP SOP Manual</span></div>
                    <p>Version 1.0 · 2021 Update</p>
                    <p className="mt-1 opacity-60">Strictly Confidential — Protocol Members Only</p>
                </div>
            </aside>

            {/* Content area */}
            <main className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border/40 hover:[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                        <Search className="h-10 w-10 text-muted-foreground/30" />
                        <p className="font-medium text-muted-foreground">No results for &ldquo;{search}&rdquo;</p>
                    </div>
                ) : (
                    <div className="max-w-3xl pb-12 space-y-4">
                        {/* Page header */}
                        <div className="flex items-start gap-4 mb-6">
                            <div className={cn('rounded-2xl p-3 flex-shrink-0', activeSection.bg)}>
                                {(() => { const I = activeSection.icon; return <I className={cn('h-6 w-6', activeSection.color)} /> })()}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h1 className="text-xl font-bold">{activeSection.title}</h1>
                                    <Badge variant="secondary" className="text-[9px] font-mono tracking-widest">{activeSection.badge}</Badge>
                                </div>
                                {activeSection.roleGate && (
                                    <div className="flex items-center gap-1 text-[10px] text-red-500 font-semibold">
                                        <Lock className="h-2.5 w-2.5" /> Delta Oscar reference material
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Subsections */}
                        {(search
                            ? filtered.flatMap(s => s.subsections.filter(sub =>
                                sub.heading.toLowerCase().includes(search.toLowerCase()) ||
                                (sub.body ?? '').toLowerCase().includes(search.toLowerCase()) ||
                                (sub.list ?? []).some(l => l.toLowerCase().includes(search.toLowerCase()))
                            ))
                            : activeSection.subsections
                        ).map((sub, i) => (
                            <Card key={i} className="border-border/50 shadow-sm overflow-hidden">
                                <button
                                    type="button"
                                    className="w-full text-left"
                                    onClick={() => toggleSection(`${activeSection.id}-${i}`)}
                                >
                                    <CardHeader className="pb-3 pt-4 px-5">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-sm font-semibold">{sub.heading}</CardTitle>
                                            <ChevronDown
                                                className={cn('h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform',
                                                    expandedSections.has(`${activeSection.id}-${i}`) ? 'rotate-180' : '')}
                                            />
                                        </div>
                                    </CardHeader>
                                </button>
                                {expandedSections.has(`${activeSection.id}-${i}`) && (
                                    <CardContent className="px-5 pb-5 pt-0">
                                        <div className="h-px bg-border/50 mb-4 -mx-5 px-5" />
                                        {renderSubsection(sub, i)}
                                    </CardContent>
                                )}
                            </Card>
                        ))}

                        {/* Mobile section list */}
                        <div className="md:hidden pt-6 border-t">
                            <p className="text-xs text-muted-foreground font-medium mb-3">All SOP Sections</p>
                            <div className="grid grid-cols-2 gap-2">
                                {SOP_SECTIONS.map(s => {
                                    const I = s.icon
                                    return (
                                        <button key={s.id} type="button" onClick={() => navigateTo(s.id)}
                                            className="flex items-center gap-2 rounded-xl border p-3 text-left text-xs hover:bg-muted transition-colors">
                                            <div className={cn('rounded-md p-1', s.bg)}><I className={cn('h-3 w-3', s.color)} /></div>
                                            <span className="truncate font-medium">{s.title}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
