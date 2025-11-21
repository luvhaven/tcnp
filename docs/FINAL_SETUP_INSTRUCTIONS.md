# Final Setup Instructions - Complete Implementation

## ✅ What Has Been Implemented

### 1. Enhanced Incidents Page
- **File**: `app/(dashboard)/incidents/page.tsx`
- Modern table UI matching reference image
- Color-coded severity badges (LOW, MEDIUM, HIGH, CRITICAL)
- Status tracking with icons (OPEN, IN PROGRESS, RESOLVED, CLOSED)
- Real-time updates via Supabase subscriptions
- Report/edit incident functionality
- Journey association with call signs

### 2. Real-Time Location Tracking System
- **Database**: `docs/LOCATION_TRACKING_MIGRATION.sql`
- **Hook**: `hooks/useLocationTracking.ts`
- **Component**: `components/tracking/LocationTracker.tsx`
- Auto-requests geolocation permission
- Tracks protocol officers in background
- Updates every 10 seconds
- Stores in `user_locations` table
- Includes battery level, speed, heading

### 3. Live Tracking Map
- **Component**: `components/tracking/LiveTrackingMap.tsx`
- **Page**: `app/(dashboard)/tracking/live/page.tsx`
- Interactive map with Leaflet
- Real-time protocol officer markers
- Status indicators (Active, Stale, Offline)
- Filter by name and role
- Stats dashboard (Journeys, Vehicles, Users, Active)
- Auto-refresh every 30 seconds

### 4. Eagle (Flight) Tracking
- **API Integration**: `lib/opensky-api.ts`
- **Page**: `app/(dashboard)/tracking/eagles/page.tsx`
- OpenSky Network API integration
- Search by callsign or ICAO24
- Real-time flight position on map
- Altitude, speed, heading display
- Auto-refresh every 10 seconds
- Stores flight data in database

### 5. RBAC System
- **Migration**: `docs/RBAC_PERMISSIONS_SYSTEM.sql`
- Role-based access control
- Delta Oscars see only assigned journeys/papas
- Tango Oscars manage cheetahs
- Alpha Oscars manage eagle squares
- Admins see everything

---

## 🚀 Setup Steps

### Step 1: Install Dependencies

```bash
cd "c:\Users\Guest User\CascadeProjects\tcnp-journey-management"

# Install map dependencies
npm install leaflet react-leaflet
npm install -D @types/leaflet

# Install if missing
npm install date-fns sonner
```

### Step 2: Run Database Migrations

**In Supabase SQL Editor**, run these scripts in order:

1. **RBAC System** (if not already run):
   ```sql
   -- File: docs/RBAC_PERMISSIONS_SYSTEM.sql
   ```

2. **Location Tracking System**:
   ```sql
   -- File: docs/LOCATION_TRACKING_MIGRATION.sql
   ```

**Expected Output**:
```
✓ Schema changes applied: assigned_do_id and created_by columns added
✓ RBAC PERMISSIONS SYSTEM INSTALLED!
✓ LOCATION TRACKING SYSTEM INSTALLED!
```

### Step 3: Add Leaflet CSS

**In** `app/layout.tsx`, add Leaflet CSS to the head:

```tsx
import 'leaflet/dist/leaflet.css'
```

Or add to `globals.css`:
```css
@import 'leaflet/dist/leaflet.css';
```

### Step 4: Configure Leaflet Icons

Create `lib/leaflet-config.ts`:

```typescript
import L from 'leaflet'

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})
```

### Step 5: Test the System

#### Test Incidents Page
1. Navigate to `/incidents`
2. Click "Report Incident"
3. Fill form and submit
4. Verify incident appears in table
5. Click incident to edit
6. Change status and save
7. Verify real-time updates

#### Test Location Tracking
1. Log in to dashboard
2. Browser should prompt for location permission
3. Click "Allow"
4. Check browser console: "✅ Location tracking active"
5. Check Supabase `user_locations` table for new rows
6. Verify updates every 10 seconds

#### Test Live Tracking Map
1. Navigate to `/tracking/live`
2. Map should load with your location
3. Your marker should appear
4. Click marker to see details
5. Use search to filter by name
6. Use role filter to filter by oscar
7. Verify stats update (Journeys, Vehicles, Users, Active)

#### Test Eagle Tracking
1. Navigate to `/tracking/eagles`
2. Enter a flight callsign (e.g., "AAL123" or "UAL456")
3. Click "Search"
4. Flight details should appear
5. Map should show flight position
6. Click "Auto-Refresh ON"
7. Verify data updates every 10 seconds

---

## 📋 Verification Checklist

### Database
- [ ] `user_locations` table exists
- [ ] `vehicle_locations` table exists
- [ ] `journey_locations` table exists
- [ ] `flight_tracking` table exists
- [ ] `assigned_do_id` column exists in `journeys`
- [ ] `created_by` column exists in `incidents`
- [ ] RLS policies enabled on all location tables
- [ ] `get_active_user_locations()` function exists
- [ ] `upsert_user_location()` function exists

### Incidents Page
- [ ] Page loads without errors
- [ ] Table displays incidents
- [ ] Severity badges show correct colors
- [ ] Status badges show correct icons
- [ ] Click incident opens edit dialog
- [ ] Report incident creates new record
- [ ] Real-time updates work
- [ ] Journey selection works

### Location Tracking
- [ ] Permission prompt appears on login
- [ ] Location updates in database every 10 seconds
- [ ] Battery level captured
- [ ] Speed and heading captured
- [ ] Console shows "✅ Location tracking active"
- [ ] Works in background

### Live Tracking Map
- [ ] Map loads correctly
- [ ] User markers appear
- [ ] Markers show correct status colors
- [ ] Click marker shows details popup
- [ ] Search by name works
- [ ] Filter by role works
- [ ] Stats update correctly
- [ ] Auto-refresh works (30s)

### Eagle Tracking
- [ ] Search by callsign works
- [ ] Search by ICAO24 works
- [ ] Flight details display correctly
- [ ] Map shows flight position
- [ ] Altitude in feet
- [ ] Speed in knots
- [ ] Auto-refresh works (10s)
- [ ] Multiple flights can be selected

---

## 🔧 Troubleshooting

### Issue: Location not updating

**Symptoms**: No rows in `user_locations` table

**Solutions**:
1. Check browser console for errors
2. Verify permission was granted
3. Check `upsert_user_location` function exists:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'upsert_user_location';
   ```
4. Check RLS policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'user_locations';
   ```
5. Verify user is authenticated:
   ```sql
   SELECT auth.uid();
   ```

### Issue: Map not loading

**Symptoms**: Blank white box where map should be

**Solutions**:
1. Verify Leaflet CSS is imported
2. Check map container has height:
   ```css
   .leaflet-container {
     height: 600px;
     width: 100%;
   }
   ```
3. Check browser console for errors
4. Verify coordinates are valid (not null)
5. Try hard refresh (Ctrl+Shift+R)

### Issue: OpenSky API not working

**Symptoms**: "No flights found" or API errors

**Solutions**:
1. Verify flight callsign is correct
2. Check if flight is currently in the air
3. OpenSky API has rate limits (check docs)
4. Try ICAO24 instead of callsign
5. Check browser console for CORS errors
6. Try a known active flight (e.g., major airline)

### Issue: Incidents not updating in real-time

**Symptoms**: Need to refresh page to see new incidents

**Solutions**:
1. Check Supabase realtime is enabled
2. Verify subscription is active:
   ```typescript
   console.log('Channel status:', channel.state)
   ```
3. Check RLS policies allow SELECT
4. Verify user has permission to view incidents
5. Check browser console for subscription errors

### Issue: Permission denied errors

**Symptoms**: "You do not have permission" errors

**Solutions**:
1. Run RBAC migration if not already done
2. Check user role:
   ```sql
   SELECT id, email, role, oscar FROM users WHERE id = auth.uid();
   ```
3. Assign appropriate role/oscar:
   ```sql
   UPDATE users SET oscar = 'delta_oscar' WHERE id = 'user-id';
   ```
4. Verify RLS policies are correct
5. Check if user is `is_active = true`

---

## 🎯 Features Summary

### Incidents Management
- ✅ Modern table UI
- ✅ Color-coded severity levels
- ✅ Status tracking with icons
- ✅ Real-time updates
- ✅ Report/edit functionality
- ✅ Journey association
- ✅ Call sign display

### Live Tracking
- ✅ Real-time protocol officer tracking
- ✅ Interactive map with markers
- ✅ Status indicators (Active/Stale/Offline)
- ✅ Search and filter
- ✅ Stats dashboard
- ✅ Auto-refresh
- ✅ Battery level monitoring

### Eagle Tracking
- ✅ OpenSky API integration
- ✅ Flight search by callsign/ICAO24
- ✅ Real-time position updates
- ✅ Altitude, speed, heading display
- ✅ Interactive map
- ✅ Auto-refresh
- ✅ Multiple flight support

### Security & Permissions
- ✅ Role-based access control
- ✅ RLS policies on all tables
- ✅ Delta Oscars see only assigned data
- ✅ Tango Oscars manage cheetahs
- ✅ Alpha Oscars manage eagle squares
- ✅ Admins see everything

---

## 📚 Additional Resources

- **RBAC Guide**: `docs/RBAC_IMPLEMENTATION_GUIDE.md`
- **Quick Setup**: `docs/QUICK_SETUP_GUIDE.md`
- **Tracking Summary**: `docs/TRACKING_IMPLEMENTATION_SUMMARY.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING_GUIDE.md`
- **Testing Checklist**: `docs/TESTING_CHECKLIST.md`

---

## 🚨 Important Notes

1. **Location Tracking**: Users must grant permission for location tracking to work
2. **OpenSky API**: Has rate limits - don't refresh too frequently
3. **Map Performance**: Use marker clustering if tracking many users
4. **Battery Drain**: Location tracking can drain battery on mobile devices
5. **Privacy**: Users can see their own location, admins see all locations
6. **Real-time**: Supabase realtime must be enabled in project settings

---

## ✅ Success Criteria

All features are working correctly when:

1. ✅ Incidents page loads and displays incidents in table format
2. ✅ Severity and status badges show correct colors
3. ✅ New incidents appear without page refresh
4. ✅ Location tracking starts automatically on login
5. ✅ User locations appear in database every 10 seconds
6. ✅ Live tracking map shows all active protocol officers
7. ✅ Map markers update in real-time
8. ✅ Eagle tracking can find and display flights
9. ✅ Flight position updates automatically
10. ✅ All features work without errors in console

---

## 🎉 You're Done!

All features have been implemented and are ready for testing. Follow the setup steps above and use the verification checklist to ensure everything is working correctly.

If you encounter any issues, refer to the troubleshooting section or the additional documentation files.
