# Quick Setup Guide - RBAC & Chat Fixes

## Step-by-Step Setup Instructions

### 1. Fix Chat "Unknown User" Issue ✅

**Already Fixed** in `components/chat/ChatSystem.tsx`:
- User data now loads before subscriptions
- Enhanced error logging
- Better fallback handling

**Test**: Send a chat message - sender name should appear correctly

---

### 2. Run RBAC Migration

**In Supabase SQL Editor**, run this script:

```sql
-- File: docs/RBAC_PERMISSIONS_SYSTEM.sql
```

**What it does**:
- Creates helper functions for role checks
- Sets up RLS policies for all tables
- Adds `assigned_do_id` column to journeys
- Creates `assign_do_to_journey()` function
- Creates `update_journey_call_sign()` function

**Expected Output**:
```
✓ Admins (super_admin, admin, captain, HOP) - Full access to everything
✓ Delta Oscars (DO) - Access to assigned papas and journeys
✓ Tango Oscars (TO) - Full access to cheetah management
✓ Alpha Oscars (AO) - Full access to eagle squares management
✓ All authenticated users - Read access to reference data
```

---

### 3. Assign Oscars to Users

**Run in Supabase SQL Editor**:

```sql
-- Assign Delta Oscar (DO) designation
UPDATE users 
SET oscar = 'delta_oscar' 
WHERE email IN ('do1@example.com', 'do2@example.com');

-- Assign Tango Oscar (TO) designation
UPDATE users 
SET oscar = 'tango_oscar' 
WHERE email = 'to@example.com';

-- Assign Alpha Oscar (AO) designation
UPDATE users 
SET oscar = 'alpha_oscar' 
WHERE email = 'ao@example.com';

-- Verify assignments
SELECT id, full_name, email, role, oscar 
FROM users 
WHERE oscar IS NOT NULL;
```

---

### 4. Assign DOs to Journeys

**Option A: Via SQL**

```sql
-- Assign a DO to a journey
SELECT assign_do_to_journey(
  'journey-uuid-here'::UUID,
  'do-user-uuid-here'::UUID
);

-- Verify assignment
SELECT 
  j.id,
  j.origin,
  j.destination,
  u.full_name as assigned_do,
  u.oscar
FROM journeys j
LEFT JOIN users u ON u.id = j.assigned_do_id
WHERE j.assigned_do_id IS NOT NULL;
```

**Option B: Via TypeScript** (in admin UI)

```typescript
const { error } = await supabase.rpc('assign_do_to_journey', {
  journey_uuid: selectedJourney.id,
  do_uuid: selectedDO.id
})

if (error) {
  toast.error('Failed to assign DO')
} else {
  toast.success('DO assigned successfully')
}
```

---

### 5. Update Sidebar Navigation

**Add to** `components/layout/sidebar.tsx`:

```typescript
const navigation = [
  // ... existing items
  {
    name: "My Assignments",
    href: "/my-assignments",
    icon: Navigation,
    roles: ["delta_oscar"] // Only show to DOs
  },
  // ... rest of items
]

// Filter navigation by user role/oscar
const filteredNavigation = navigation.filter(item => {
  if (!item.roles) return true
  return item.roles.includes(currentUser?.oscar) || 
         item.roles.includes(currentUser?.role)
})
```

---

### 6. Test the System

#### Test as Admin:
1. Login as admin user
2. Navigate to Journeys page
3. **Expected**: Can see all journeys
4. **Expected**: Can create/edit/delete journeys
5. Navigate to Cheetahs page
6. **Expected**: Can manage cheetahs

#### Test as Delta Oscar (DO):
1. Login as DO user
2. Navigate to "My Assignments"
3. **Expected**: See only assigned journeys
4. Click on a journey
5. **Expected**: See full papa details
6. Click "First Course" button
7. **Expected**: Status updates, actual_departure set
8. Try to access Cheetahs page
9. **Expected**: Can view but cannot edit

#### Test as Tango Oscar (TO):
1. Login as TO user
2. Navigate to Cheetahs page
3. **Expected**: Can create/edit/delete cheetahs
4. Try to access Eagle Squares page
5. **Expected**: Can view but cannot edit

#### Test as Alpha Oscar (AO):
1. Login as AO user
2. Navigate to Eagle Squares page
3. **Expected**: Can create/edit/delete eagle squares
4. Try to access Cheetahs page
5. **Expected**: Can view but cannot edit

---

### 7. Verify Chat is Working

1. Open chat in two browser windows (different accounts)
2. Send a message from Account A
3. **Expected**: 
   - Message appears instantly in Account B
   - Sender name shows correctly (not "Unknown User")
   - Unread badge updates in real-time
4. Check browser console:
   - ✅ "Chat realtime subscription active"
   - ✅ "Current user loaded: {...}"
   - ✅ "Fetched full message with user data: {...}"

---

## Common Issues & Fixes

### Issue 1: DO cannot see assigned journeys

**Cause**: Journey not assigned to DO

**Fix**:
```sql
-- Check assignment
SELECT assigned_do_id FROM journeys WHERE id = 'journey-id';

-- Assign if null
SELECT assign_do_to_journey('journey-id', 'do-user-id');
```

### Issue 2: TO cannot edit cheetahs

**Cause**: User doesn't have `oscar = 'tango_oscar'`

**Fix**:
```sql
UPDATE users SET oscar = 'tango_oscar' WHERE id = 'user-id';
```

### Issue 3: Chat shows "Unknown User"

**Cause**: User data not loaded or missing full_name

**Fix**:
```sql
-- Check user data
SELECT id, full_name, oscar FROM users WHERE id = auth.uid();

-- Update if missing
UPDATE users SET full_name = 'User Name' WHERE id = 'user-id';
```

### Issue 4: RLS policy blocking access

**Cause**: User role/oscar not set correctly

**Fix**:
```sql
-- Check current user
SELECT id, email, role, oscar, is_active FROM users WHERE id = auth.uid();

-- Update role
UPDATE users SET role = 'admin' WHERE id = 'user-id';

-- Update oscar
UPDATE users SET oscar = 'delta_oscar' WHERE id = 'user-id';

-- Ensure active
UPDATE users SET is_active = true WHERE id = 'user-id';
```

---

## Verification Queries

### Check User Permissions

```sql
-- Check if current user is admin
SELECT is_admin();

-- Check if current user is DO
SELECT is_delta_oscar();

-- Check if current user is TO
SELECT is_tango_oscar();

-- Check if current user is AO
SELECT is_alpha_oscar();

-- Get current user's oscar
SELECT get_current_oscar();
```

### Check Journey Assignments

```sql
-- List all DO assignments
SELECT 
  u.full_name as do_name,
  u.oscar,
  COUNT(j.id) as journey_count
FROM users u
LEFT JOIN journeys j ON j.assigned_do_id = u.id
WHERE u.oscar = 'delta_oscar'
GROUP BY u.id, u.full_name, u.oscar;
```

### Check RLS Policies

```sql
-- List all policies on journeys table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'journeys';
```

---

## Files Created/Modified

### New Files:
1. `docs/RBAC_PERMISSIONS_SYSTEM.sql` - Complete RBAC migration
2. `docs/RBAC_IMPLEMENTATION_GUIDE.md` - Detailed documentation
3. `docs/QUICK_SETUP_GUIDE.md` - This file
4. `components/journeys/CallSignUpdater.tsx` - Call sign UI component
5. `app/(dashboard)/my-assignments/page.tsx` - DO dashboard

### Modified Files:
1. `components/chat/ChatSystem.tsx` - Fixed unknown user issue
2. `components/layout/sidebar.tsx` - Enhanced unread badge
3. `hooks/useUnreadChatCount.ts` - Improved realtime updates

---

## Next Steps

1. ✅ Run RBAC migration
2. ✅ Assign oscars to users
3. ✅ Assign DOs to journeys
4. ✅ Update sidebar navigation
5. ✅ Test all roles
6. ✅ Verify chat functionality
7. 📱 Consider mobile app for DOs
8. 📊 Add analytics dashboard
9. 🔔 Implement push notifications for assignments
10. 📍 Add GPS tracking for real-time updates

---

## Support Resources

- **Full Documentation**: `docs/RBAC_IMPLEMENTATION_GUIDE.md`
- **Migration Script**: `docs/RBAC_PERMISSIONS_SYSTEM.sql`
- **Troubleshooting**: `docs/TROUBLESHOOTING_GUIDE.md`
- **Testing Checklist**: `docs/TESTING_CHECKLIST.md`

---

## Quick Commands Reference

```sql
-- Assign DO to journey
SELECT assign_do_to_journey('journey-uuid', 'do-uuid');

-- Update journey status (as DO)
SELECT update_journey_call_sign('journey-uuid', 'first_course');

-- Check user role
SELECT is_admin();

-- Assign oscar
UPDATE users SET oscar = 'delta_oscar' WHERE email = 'user@example.com';

-- View DO assignments
SELECT * FROM journeys WHERE assigned_do_id = 'do-user-id';
```
