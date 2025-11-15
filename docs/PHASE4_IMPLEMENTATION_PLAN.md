# Phase 4: Real Tracking, Role-Based Access & Functional Features

## 🎯 Objectives

1. ✅ Rename "Vehicle Tracking" → "Cheetah Tracking"
2. ✅ Rename "Flight Tracking" → "Eagle Tracking"
3. ⏳ Implement real GPS tracking for all Protocol Officers (except doriazowan@gmail.com and tcnpjourney@outlook.com)
4. ⏳ Implement real flight tracking with OpenSky API
5. ⏳ Make Incidents fully functional
6. ⏳ Make Audit Logs fully functional
7. ⏳ Implement comprehensive role-based access control
8. ⏳ Add Protocol call sign updates for DOs during journeys
9. ⏳ Real-time updates visible to authorized roles

---

## 📋 Role-Based Access Control Matrix

### **Super Admin** (doriazowan@gmail.com)
- ✅ Full system access
- ✅ View all data
- ✅ Manage all entities
- ✅ View live maps and tracking
- ✅ Manage all users
- ✅ View all call sign updates

### **Admin** (tcnpjourney@outlook.com)
- ✅ View all data
- ✅ Manage most entities
- ✅ View live maps and tracking
- ✅ Manage users (except Super Admin)
- ✅ View all call sign updates

### **Prof** (Fixed Title)
- ✅ View all journeys
- ✅ View all call sign updates
- ✅ View Papas
- ✅ View Cheetahs
- ❌ Cannot track (no GPS sharing)
- ❌ Cannot manage entities

### **Duchess** (Fixed Title)
- ✅ View all journeys
- ✅ View all call sign updates
- ✅ View Papas
- ✅ View Cheetahs
- ❌ Cannot track (no GPS sharing)
- ❌ Cannot manage entities

### **Captain**
- ✅ View all journeys
- ✅ View all call sign updates from DOs
- ✅ View all Cheetah tracking (real-time)
- ✅ Manage journeys
- ✅ Assign titles
- ❌ Cannot view live maps (Super Admin/Admin only)

### **Vice Captain** (2 positions)
- ✅ View all journeys
- ✅ View call sign updates
- ✅ View Cheetah tracking
- ✅ Assist Captain

### **Head of Command**
- ✅ View all journeys
- ✅ View all call sign updates
- ✅ View Cheetah tracking (real-time)
- ✅ Monitor all operations
- ✅ View incidents

### **Head of Operations (HOP)**
- ✅ View all journeys
- ✅ View all call sign updates
- ✅ View Cheetah tracking (real-time)
- ✅ Manage field operations
- ✅ View incidents

### **Command**
- ✅ View all journeys
- ✅ View call sign updates
- ✅ View Cheetah tracking (real-time)
- ✅ Monitor operations

### **Delta Oscar (DO)** - Field Officers
- ✅ **GPS Tracking:** Share location while on duty
- ✅ **Call Sign Updates:** Send updates during journey
- ✅ **View:** Assigned journeys only
- ✅ **Update:** Journey status via call signs
- ✅ **Create:** Incidents
- ❌ Cannot view other DOs' locations
- ❌ Cannot manage Cheetahs

### **Tango Oscar (TO)** - Transport Officers
- ✅ **Manage:** Fleet (Cheetahs) - CRUD operations
- ✅ **View:** All Cheetah tracking (real-time)
- ✅ **View:** All journeys
- ✅ **Assign:** Cheetahs to journeys
- ❌ Cannot send call sign updates (not field officers)

### **Alpha Oscar (AO)** - Airport Officers
- ✅ **Manage:** Eagle Squares (Airports)
- ✅ **View:** Flight tracking (Eagles)
- ✅ **Update:** Flight ETAs
- ✅ **View:** Journeys with flight components
- ✅ **View:** Call sign updates related to airports

### **November Oscar (NO)** - Hotel Officers
- ✅ **Manage:** Nests (Hotels)
- ✅ **Manage:** Room assignments
- ✅ **View:** Journeys with hotel components
- ✅ **View:** Call sign updates related to hotels
- ✅ **Confirm:** Papa arrivals at nests

### **Victor Oscar (VO)** - Venue Officers
- ✅ **Manage:** Theatres (Venues)
- ✅ **View:** Journeys with venue components
- ✅ **View:** Call sign updates related to venues
- ✅ **Confirm:** Papa arrivals at theatres

### **Echo Oscar (EO)** - Event Coordination
- ✅ **Manage:** Programs/Events
- ✅ **View:** All journeys for their programs
- ✅ **Coordinate:** Multi-unit operations
- ✅ **View:** Call sign updates for their programs

### **Team Leads** (All Oscar Units)
- ✅ All permissions of their unit
- ✅ **Manage:** Team members in their unit
- ✅ **Assign:** Tasks to team members
- ✅ **View:** Team performance metrics

---

## 🚗 Cheetah Tracking Implementation

### Features:
1. **Real GPS Tracking**
   - Uses browser Geolocation API
   - High accuracy mode
   - Updates every 5 seconds
   - Stores: lat, lng, speed, heading, accuracy, altitude

2. **Who Can Track:**
   - All Protocol Officers EXCEPT:
     - doriazowan@gmail.com (Super Admin)
     - tcnpjourney@outlook.com (Admin)
   - Primarily: Delta Oscars (DOs)

3. **Who Can View:**
   - Super Admin: All tracking + live maps
   - Admin: All tracking + live maps
   - Captain: All tracking (no live maps)
   - Vice Captain: All tracking (no live maps)
   - Head of Command: All tracking (no live maps)
   - HOP: All tracking (no live maps)
   - Command: All tracking (no live maps)
   - Tango Oscar: All tracking (real-time)
   - Delta Oscar: Only their own tracking

4. **Database:**
   - Table: `vehicle_locations` (already exists)
   - Real-time subscriptions for live updates
   - Historical tracking data

---

## ✈️ Eagle Tracking (Flight Tracking) Implementation

### Features:
1. **OpenSky Network API Integration**
   - Real-time flight data
   - Global coverage
   - Free tier (no API key)
   - Updates every 30 seconds

2. **Who Can Manage:**
   - Super Admin: Full access + live maps
   - Admin: Full access + live maps
   - Alpha Oscar: Manage flights, update ETAs
   - Alpha Oscar (Team Lead): All AO permissions + team management

3. **Who Can View:**
   - All roles can view flight status
   - Only Super Admin/Admin see live maps

4. **Database:**
   - Table: `flight_tracking` (already exists)
   - Link to Papas
   - Store: flight number, status, position, ETA

---

## 📞 Protocol Call Sign Updates

### Call Signs (from schema):
- **First Course** - Departing to Theatre
- **Chapman** - Arrived at Theatre
- **Dessert** - Returning to Nest
- **Cocktail** - General update
- **Blue Cocktail** - Special status
- **Red Cocktail** - Alert status
- **Re-order** - Change of plans
- **Broken Arrow** - EMERGENCY

### Implementation:
1. **Who Can Send:**
   - Delta Oscar (DO) - Primary users
   - Field officers during active journeys

2. **Who Can View:**
   - Super Admin
   - Admin
   - Prof
   - Duchess
   - Captain
   - Vice Captain
   - Head of Command
   - HOP
   - Command
   - Alpha Oscar (airport-related)
   - November Oscar (hotel-related)
   - Victor Oscar (venue-related)

3. **Features:**
   - Quick-select call sign buttons
   - Auto-attach current location
   - Auto-attach current journey
   - Real-time notifications
   - Audit trail

4. **Database:**
   - Table: `journey_events` (already exists)
   - Stores: call sign, location, timestamp, notes

---

## 🚨 Incidents System

### Features:
1. **Create Incident:**
   - Any authenticated user
   - Required: type, severity, description
   - Optional: location, journey link, photos

2. **Severity Levels:**
   - Low
   - Medium
   - High
   - Critical

3. **Who Can Manage:**
   - Super Admin: All incidents
   - Admin: All incidents
   - Captain: All incidents
   - Head of Command: All incidents
   - HOP: Field incidents

4. **Who Can View:**
   - All authenticated users (view only)
   - Managers can update status

5. **Workflow:**
   - Open → In Progress → Resolved → Closed

6. **Notifications:**
   - Critical incidents → Immediate alerts
   - High incidents → Priority notifications
   - Auto-escalate if unresolved

---

## 📝 Audit Logs System

### Features:
1. **Auto-Logging:**
   - All CRUD operations
   - User login/logout
   - Role changes
   - Title assignments
   - Journey status changes
   - Incident creation/resolution

2. **Who Can View:**
   - Super Admin: All logs
   - Admin: All logs
   - Captain: Operations logs

3. **Logged Data:**
   - User ID
   - Action type
   - Target entity
   - Changes (before/after)
   - IP address
   - Timestamp

4. **Database:**
   - Table: `audit_logs` (already exists)
   - Retention: 1 year
   - Searchable and filterable

---

## 🗺️ Live Maps (Super Admin & Admin Only)

### Features:
1. **Cheetah Tracking Map:**
   - Show all active Cheetahs
   - Real-time position updates
   - Color-coded by status
   - Click for details

2. **Eagle Tracking Map:**
   - Show all tracked flights
   - Flight paths
   - Current position
   - ETA visualization

3. **Technology:**
   - Leaflet.js or Mapbox GL
   - OpenStreetMap tiles
   - Real-time WebSocket updates

---

## 📊 Implementation Steps

### Step 1: Database Updates ✅
- Tables already exist from Phase 3
- Add RLS policies for role-based access

### Step 2: Cheetah Tracking ⏳
- Update page title and content
- Add role-based GPS tracking
- Exclude Super Admin and Admin from tracking
- Add real-time subscriptions
- Implement live map (Super Admin/Admin only)

### Step 3: Eagle Tracking ⏳
- Update page title and content
- Integrate OpenSky API
- Add flight management UI
- Implement live map (Super Admin/Admin only)

### Step 4: Call Sign Updates ⏳
- Add call sign update UI to Journeys page
- Quick-select buttons for DOs
- Real-time notifications
- Visible to authorized roles

### Step 5: Incidents ⏳
- Full CRUD implementation
- Severity and status workflow
- File upload for photos
- Real-time notifications

### Step 6: Audit Logs ⏳
- Auto-logging triggers
- Search and filter UI
- Export functionality
- Retention policy

### Step 7: Role-Based Access ⏳
- Implement permission checks on all pages
- Hide/show features based on role
- API-level access control
- RLS policies in Supabase

### Step 8: Testing ⏳
- Test each role's permissions
- Test GPS tracking
- Test flight tracking
- Test call sign updates
- Test incidents workflow
- Test audit logging

---

## 🔐 Security Considerations

1. **GPS Tracking:**
   - Only share location when explicitly tracking
   - Stop tracking when page closes
   - Encrypted transmission
   - Location history retention: 30 days

2. **API Keys:**
   - No API key needed for OpenSky (free tier)
   - Future: Store API keys in environment variables

3. **Access Control:**
   - Server-side validation
   - RLS policies in database
   - Client-side UI restrictions
   - Audit all sensitive actions

---

## 📱 Mobile Considerations

1. **GPS Tracking:**
   - Works on mobile browsers
   - Request location permission
   - Battery optimization tips
   - Background tracking limitations

2. **Call Sign Updates:**
   - Large touch-friendly buttons
   - Quick access from mobile
   - Offline queue (future)

---

## ✅ Success Criteria

- [ ] Cheetah Tracking renamed and functional
- [ ] Eagle Tracking renamed and functional
- [ ] Real GPS tracking for all officers (except Super Admin/Admin)
- [ ] Real flight tracking with OpenSky API
- [ ] Call sign updates working for DOs
- [ ] Incidents fully functional with workflow
- [ ] Audit logs capturing all actions
- [ ] Role-based access enforced everywhere
- [ ] Live maps for Super Admin/Admin
- [ ] Real-time updates across all features

---

**This is a comprehensive implementation that will make your TCNP Journey Management system production-ready!**
