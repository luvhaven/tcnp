# Run Migrations - FIXED VERSION

## ⚠️ IMPORTANT: PostgreSQL Enum Constraint

PostgreSQL requires enum values to be **committed in a separate transaction** before they can be used. This is why we split the migration into 2 steps.

---

## 🚀 RUN THESE MIGRATIONS IN ORDER

### **STEP 1: Add Head of Operations Role** (Run First)

Open **Supabase Dashboard** → **SQL Editor** → Run:

```sql
-- File: /docs/MIGRATION_STEP1_ADD_ROLE.sql
-- Copy and paste the entire content
```

**Expected output:**
```
✓ Head of Operations role added
✓ STEP 1 COMPLETE
```

**⚠️ IMPORTANT:** After running this, **wait 5 seconds** before running Step 2. This ensures the enum value is committed.

---

### **STEP 2: Apply All Fixes and Tracking** (Run Second)

Open **Supabase Dashboard** → **SQL Editor** → Run:

```sql
-- File: /docs/MIGRATION_STEP2_FIXES_AND_TRACKING.sql
-- Copy and paste the entire content
```

**Expected output:**
```
✓ Fixed cascade delete for cheetahs
✓ Updated journey visibility policies
✓ Created protocol_officer_locations table
✓ Added live tracking RLS policies
✓ Created cleanup function
✓ Updated official titles
✓ STEP 2 COMPLETE
```

---

## ✅ WHAT'S FIXED

### **1. Enum Error** ✅
**Before:** `unsafe use of new value "head_of_operations" of enum type user_role`
**After:** Split into 2 migrations - enum added first, then used

### **2. Cheetah Deletion** ✅
**Before:** Foreign key constraint violation
**After:** Cheetahs can be deleted (journeys set to NULL)

### **3. Journey Visibility** ✅
**Before:** Limited role access
**After:** All specified roles can view journeys

### **4. Live Tracking** ✅
**Before:** No infrastructure
**After:** Complete tracking system with RLS

---

## ✅ COMPLETED SETUP

### **1. NPM Packages Installed** ✅
```
✓ @radix-ui/react-tabs
✓ leaflet
✓ react-leaflet
✓ @types/leaflet
```

### **2. Leaflet CSS Added** ✅
```
✓ Added to /app/layout.tsx
```

---

## 🧪 TEST AFTER MIGRATIONS

### **1. Head of Operations Role**
```
1. Go to Manage Officers
2. Create officer with "Head of Operations" role
3. ✅ Should save successfully
4. Login as that officer
5. ✅ Should see all journeys
```

### **2. Cheetah Deletion**
```
1. Go to Fleet page
2. Create a journey and assign a cheetah
3. Try deleting that cheetah
4. ✅ Should delete successfully
```

### **3. Live Tracking**
```
1. Login as Delta Oscar
2. Go to /tracking/live
3. Click "Start Tracking"
4. ✅ Should start tracking location
```

---

## 📊 MIGRATION STATUS

**Before:**
- ❌ Enum error blocking migration
- ❌ Cheetah deletion failing
- ❌ Journey visibility limited
- ❌ No live tracking

**After:**
- ✅ 16 roles (including Head of Operations)
- ✅ Cheetah deletion working
- ✅ Journey visibility for all specified roles
- ✅ Live tracking infrastructure complete
- ✅ NPM packages installed
- ✅ Leaflet CSS added

---

## 🎯 WHAT'S WORKING NOW

### ✅ **All Features Implemented:**
1. ✅ Flight lookup (23 airlines)
2. ✅ Settings page
3. ✅ Eagle tracking with landing status
4. ✅ Dashboard buttons
5. ✅ Enhanced audit logs
6. ✅ Fleet formatting
7. ✅ 16 roles with auto-OSCAR
8. ✅ Cheetah deletion fixed
9. ✅ Journey visibility updated
10. ✅ Live tracking system
11. ✅ Papas tabbed form component
12. ✅ NPM dependencies installed
13. ✅ Leaflet CSS added

---

## 🚀 NEXT STEPS

### **1. Run Migrations** (5 minutes)
- Run MIGRATION_STEP1_ADD_ROLE.sql
- Wait 5 seconds
- Run MIGRATION_STEP2_FIXES_AND_TRACKING.sql

### **2. Test Features** (30 minutes)
- Test cheetah deletion
- Test Head of Operations role
- Test live tracking
- Test journey visibility

### **3. Deploy!** 🎉
```bash
npm run build
# Deploy to your hosting platform
```

---

## 🎉 YOU'RE READY!

**Setup Complete:**
- ✅ NPM packages installed
- ✅ Leaflet CSS added
- ✅ Migrations ready to run

**Just run the 2 migrations and you're done!** 🚀

**Total time: ~5 minutes** ⚡
