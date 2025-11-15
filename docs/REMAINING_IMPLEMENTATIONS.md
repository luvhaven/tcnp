# Remaining Implementations Guide

## Overview
This document provides implementation instructions for the remaining 5 major features:

1. ✅ Flight Lookup - COMPLETED
2. ✅ Audit Logs Enhancement - COMPLETED  
3. Eagle Squares with Papa Arrivals/Departures
4. Live Cheetah Tracking Map
5. Fleet Page Formatting Fix
6. Papas Tabbed Form (Basic, Presentation, Preferences, Speaking)
7. Manage Officers - Add Missing Roles

---

## 3. Eagle Squares with Papa Arrivals/Departures

### Database Setup
Already created in `MIGRATION_ENHANCEMENTS.sql`:
- View: `eagle_squares_with_flights`
- Shows arriving and departing flights for each airport

### Frontend Implementation

**File:** `/app/(dashboard)/eagle-squares/page.tsx`

Add a dialog that shows when clicking an airport:

```typescript
const [selectedAirport, setSelectedAirport] = useState<any>(null)
const [airportFlights, setAirportFlights] = useState<any>(null)

const viewAirportDetails = async (airport: any) => {
  setSelectedAirport(airport)
  
  // Load flights for this airport
  const { data } = await supabase
    .from('flight_tracking')
    .select(`
      *,
      papas(full_name, title)
    `)
    .or(`departure_airport.eq.${airport.code},arrival_airport.eq.${airport.code}`)
    .order('scheduled_departure')
  
  setAirportFlights(data)
}

// In the render, add a Dialog:
<Dialog open={!!selectedAirport} onOpenChange={() => setSelectedAirport(null)}>
  <DialogContent className="max-w-4xl">
    <DialogHeader>
      <DialogTitle>{selectedAirport?.name} - Flight Schedule</DialogTitle>
    </DialogHeader>
    
    <Tabs defaultValue="arrivals">
      <TabsList>
        <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
        <TabsTrigger value="departures">Departures</TabsTrigger>
      </TabsList>
      
      <TabsContent value="arrivals">
        {airportFlights?.filter(f => f.arrival_airport === selectedAirport?.code).map(flight => (
          <div key={flight.id} className="border p-3 rounded mb-2">
            <p><strong>Papa:</strong> {flight.papas.title} {flight.papas.full_name}</p>
            <p><strong>Flight:</strong> {flight.flight_number}</p>
            <p><strong>From:</strong> {flight.departure_airport}</p>
            <p><strong>Scheduled:</strong> {new Date(flight.scheduled_arrival).toLocaleString()}</p>
            <Badge>{flight.status}</Badge>
          </div>
        ))}
      </TabsContent>
      
      <TabsContent value="departures">
        {/* Similar structure for departures */}
      </TabsContent>
    </Tabs>
  </DialogContent>
</Dialog>
```

---

## 4. Live Cheetah Tracking Map

### Implementation Strategy

**Option 1: Leaflet.js (Recommended)**

Install dependencies:
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

**File:** `/components/tracking/CheetahMap.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

type CheetahMapProps = {
  locations: Array<{
    cheetah_id: string
    latitude: number
    longitude: number
    timestamp: string
    cheetahs: { call_sign: string }
    users: { full_name: string, oscar: string }
  }>
}

export default function CheetahMap({ locations }: CheetahMapProps) {
  const [center, setCenter] = useState<[number, number]>([9.0765, 7.3986]) // Abuja, Nigeria
  
  // Group locations by cheetah
  const cheetahPaths = locations.reduce((acc, loc) => {
    if (!acc[loc.cheetah_id]) {
      acc[loc.cheetah_id] = []
    }
    acc[loc.cheetah_id].push(loc)
    return acc
  }, {} as Record<string, typeof locations>)
  
  return (
    <MapContainer 
      center={center} 
      zoom={12} 
      style={{ height: '600px', width: '100%' }}
      className="rounded-lg border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {Object.entries(cheetahPaths).map(([cheetahId, path]) => {
        const latest = path[path.length - 1]
        const positions: [number, number][] = path.map(p => [p.latitude, p.longitude])
        
        return (
          <div key={cheetahId}>
            {/* Draw path */}
            <Polyline positions={positions} color="blue" weight={3} />
            
            {/* Current position marker */}
            <Marker position={[latest.latitude, latest.longitude]}>
              <Popup>
                <div>
                  <p><strong>{latest.cheetahs.call_sign}</strong></p>
                  <p>Driver: {latest.users.full_name} ({latest.users.oscar})</p>
                  <p>Last update: {new Date(latest.timestamp).toLocaleTimeString()}</p>
                </div>
              </Popup>
            </Marker>
          </div>
        )
      })}
    </MapContainer>
  )
}
```

**Update:** `/app/(dashboard)/tracking/cheetahs/page.tsx`

```typescript
import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues with Leaflet
const CheetahMap = dynamic(() => import('@/components/tracking/CheetahMap'), {
  ssr: false,
  loading: () => <div>Loading map...</div>
})

// In the component, add the map section:
{(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && locations.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle>Live Map View</CardTitle>
      <CardDescription>Real-time Cheetah positions and movement trails</CardDescription>
    </CardHeader>
    <CardContent>
      <CheetahMap locations={locations} />
    </CardContent>
  </Card>
)}
```

**Add Leaflet CSS to layout:**

`/app/layout.tsx`:
```typescript
import 'leaflet/dist/leaflet.css'
```

**Copy Leaflet images to public folder:**
```bash
mkdir -p public/leaflet
# Download marker images from Leaflet CDN or node_modules
```

---

## 5. Fleet Page Formatting Fix

**Issue:** Call signs showing as "CHT" and "LAG" instead of proper format.

**File:** `/app/(dashboard)/cheetahs/page.tsx`

Find where call_sign is displayed and ensure proper formatting:

```typescript
// Add formatting function
const formatCallSign = (callSign: string) => {
  if (!callSign) return 'N/A'
  
  // If it's already formatted (e.g., "CHEETAH-01"), return as is
  if (callSign.includes('-') || callSign.includes(' ')) {
    return callSign
  }
  
  // Otherwise, format it properly
  // CHT001 -> CHEETAH-001
  // LAG001 -> LAGOON-001
  const prefix = callSign.substring(0, 3)
  const number = callSign.substring(3)
  
  const prefixMap: Record<string, string> = {
    'CHT': 'CHEETAH',
    'LAG': 'LAGOON',
    'LIO': 'LION',
    'LEO': 'LEOPARD'
  }
  
  const fullPrefix = prefixMap[prefix] || prefix
  return `${fullPrefix}-${number.padStart(3, '0')}`
}

// In the render:
<p className="font-medium text-lg">
  {formatCallSign(cheetah.call_sign)}
</p>
```

**Also update the form to use proper format:**

```typescript
const [formData, setFormData] = useState({
  call_sign: '',
  // ... other fields
})

// Add validation/formatting on submit
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  
  // Format call sign before saving
  const formattedCallSign = formatCallSign(formData.call_sign)
  
  const data = {
    ...formData,
    call_sign: formattedCallSign
  }
  
  // ... rest of submit logic
}
```

---

## 6. Papas Tabbed Form

This is the most complex feature. Due to length, see separate file: `PAPAS_TABBED_FORM_IMPLEMENTATION.md`

Key points:
- Use shadcn/ui Tabs component
- 5 tabs: Basic Info, Presentation, Preferences, Speaking, Entourage
- All fields already added to database in `MIGRATION_ENHANCEMENTS.sql`
- Form state management with React hooks
- Validation for each tab

---

## 7. Manage Officers - Add Missing Roles

**File:** `/app/(dashboard)/officers/manage/page.tsx`

Update the roles array:

```typescript
const roles = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'prof', label: 'Prof (View Only)' },
  { value: 'duchess', label: 'Duchess (View Only)' },
  { value: 'captain', label: 'Captain' },
  { value: 'vice_captain', label: 'Vice Captain' },
  { value: 'head_of_command', label: 'Head of Command' },
  { value: 'command', label: 'Command' },
  { value: 'delta_oscar', label: 'Delta Oscar (DO)' },
  { value: 'tango_oscar', label: 'Tango Oscar (TO)' },
  { value: 'head_tango_oscar', label: 'Head, Tango Oscar' },
  { value: 'alpha_oscar', label: 'Alpha Oscar (AO)' },
  { value: 'november_oscar', label: 'November Oscar (NO)' },
  { value: 'victor_oscar', label: 'Victor Oscar (VO)' },
  { value: 'viewer', label: 'Viewer' }
]
```

**Remove OSCAR Call Sign field:**

Find and remove this section:
```typescript
<div className="space-y-2">
  <Label htmlFor="oscar">OSCAR Call Sign</Label>
  <Input
    id="oscar"
    placeholder="e.g., OSCAR-ALPHA"
    value={formData.oscar}
    onChange={(e) => setFormData({ ...formData, oscar: e.target.value })}
  />
</div>
```

**Auto-generate OSCAR based on role:**

```typescript
const generateOscar = (fullName: string, role: string) => {
  const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase()
  const rolePrefix = role.toUpperCase().replace('_', '-')
  return `OSCAR-${initials}-${rolePrefix}`
}

// In handleSubmit:
const oscar = generateOscar(formData.full_name, formData.role)

const { error } = await supabase
  .from('users')
  .insert([{
    ...formData,
    oscar // Auto-generated
  }])
```

---

## Implementation Order

1. ✅ Flight Lookup - DONE
2. ✅ Audit Logs - DONE
3. **Fleet Formatting** - Quick fix (15 min)
4. **Manage Officers Roles** - Quick fix (15 min)
5. **Eagle Squares Flights** - Medium (1 hour)
6. **Cheetah Map** - Complex (2-3 hours)
7. **Papas Tabbed Form** - Most complex (3-4 hours)

---

## Testing Checklist

After each implementation:

- [ ] Feature works as expected
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Audit logs capture actions
- [ ] RLS policies allow access
- [ ] Data persists correctly

---

## Support Files Created

1. `MIGRATION_ENHANCEMENTS.sql` - Database changes
2. `COMPREHENSIVE_FIX.sql` - RLS policies
3. `PAPAS_TABBED_FORM_IMPLEMENTATION.md` - Detailed Papa form guide
4. This file - Implementation roadmap

---

**Next Steps:**
1. Run `MIGRATION_ENHANCEMENTS.sql` in Supabase
2. Implement features in order above
3. Test each feature thoroughly
4. Deploy to production

Good luck! 🚀
