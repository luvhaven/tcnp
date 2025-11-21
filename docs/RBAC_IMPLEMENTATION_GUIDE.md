# Role-Based Access Control (RBAC) Implementation Guide

## Overview

This guide explains the comprehensive RBAC system implemented for the TCNP Journey Management application. The system ensures that users only have access to data and features relevant to their role and unit.

---

## Role Hierarchy

### 1. **Admins** (Full Access)
- **Roles**: `super_admin`, `admin`, `captain`, `head_of_operations`
- **Access**: Complete access to all features and data
- **Can**:
  - View and manage all papas, journeys, cheetahs, eagle squares, nests, theatres
  - Assign DOs to journeys
  - View all incidents and audit logs
  - Manage users and settings

### 2. **Delta Oscar (DO)** - Journey Coordinators
- **Oscar**: `delta_oscar`
- **Access**: Limited to assigned journeys and their papas
- **Can**:
  - View full details of papas they are assigned to
  - Update journey status via call signs (First Course, In Progress, Completed)
  - Create and view incidents for their journeys
  - Update notes for their assigned papas
- **Cannot**:
  - View other DOs' assignments
  - Manage cheetahs, eagle squares, or other resources
  - Access admin features

### 3. **Tango Oscar (TO)** - Vehicle Management
- **Oscar**: `tango_oscar`
- **Access**: Full access to cheetah (vehicle) management
- **Can**:
  - Create, view, update, and delete cheetahs
  - View all journeys (for coordination)
  - View reference data (papas, nests, theatres)
- **Cannot**:
  - Manage eagle squares
  - Assign DOs to journeys
  - Access admin features

### 4. **Alpha Oscar (AO)** - Airport Management
- **Oscar**: `alpha_oscar`
- **Access**: Full access to eagle squares (airport) management
- **Can**:
  - Create, view, update, and delete eagle squares
  - View all journeys (for coordination)
  - View reference data (papas, nests, theatres)
- **Cannot**:
  - Manage cheetahs
  - Assign DOs to journeys
  - Access admin features

### 5. **Authenticated Users** (Read-Only)
- **Access**: Read-only access to reference data
- **Can**:
  - View papas, journeys, cheetahs, eagle squares, nests, theatres
  - View their own profile
- **Cannot**:
  - Create, update, or delete any data
  - Access sensitive information

---

## Database Schema Changes

### New Column: `assigned_do_id`

Added to `journeys` table:

```sql
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS assigned_do_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_journeys_assigned_do ON journeys(assigned_do_id);
```

This column links a journey to the Delta Oscar responsible for it.

---

## Helper Functions

### 1. **Role Check Functions**

```sql
is_admin() → BOOLEAN
is_delta_oscar() → BOOLEAN
is_tango_oscar() → BOOLEAN
is_alpha_oscar() → BOOLEAN
get_current_oscar() → TEXT
```

These functions check the current user's role/oscar for use in RLS policies.

### 2. **assign_do_to_journey**

```sql
assign_do_to_journey(journey_uuid UUID, do_uuid UUID) → VOID
```

**Purpose**: Assign a Delta Oscar to a journey (admin only)

**Example**:
```typescript
await supabase.rpc('assign_do_to_journey', {
  journey_uuid: 'journey-id-here',
  do_uuid: 'user-id-here'
})
```

### 3. **update_journey_call_sign**

```sql
update_journey_call_sign(journey_uuid UUID, new_status TEXT) → JSONB
```

**Purpose**: Allow DOs to update journey status with automatic timestamp tracking

**Valid Statuses**:
- `planned` → Initial state
- `first_course` → Journey started (sets `actual_departure`)
- `in_progress` → En route
- `completed` → Journey finished (sets `actual_arrival`)
- `cancelled` → Journey cancelled

**Example**:
```typescript
await supabase.rpc('update_journey_call_sign', {
  journey_uuid: 'journey-id-here',
  new_status: 'first_course'
})
```

**Auto-timestamps**:
- `first_course` or `in_progress` → Sets `actual_departure` if null
- `completed` → Sets `actual_arrival` if null

---

## Row Level Security (RLS) Policies

### Papas Table

| Policy | Who | Access | Condition |
|--------|-----|--------|-----------|
| Admins have full access | Admins | ALL | `is_admin()` |
| DOs can view their assigned papas | Delta Oscars | SELECT | Journey assigned to DO |
| DOs can update their assigned papa notes | Delta Oscars | UPDATE | Journey assigned to DO |
| Authenticated users can view basic info | All | SELECT | Authenticated |

### Journeys Table

| Policy | Who | Access | Condition |
|--------|-----|--------|-----------|
| Admins have full access | Admins | ALL | `is_admin()` |
| DOs can view their assigned journeys | Delta Oscars | SELECT | `assigned_do_id = auth.uid()` |
| DOs can update their assigned journey status | Delta Oscars | UPDATE | `assigned_do_id = auth.uid()` |
| Authenticated users can view all journeys | All | SELECT | Authenticated |

### Cheetahs Table

| Policy | Who | Access | Condition |
|--------|-----|--------|-----------|
| Admins have full access | Admins | ALL | `is_admin()` |
| Tango Oscars have full access | Tango Oscars | ALL | `is_tango_oscar()` |
| Authenticated users can view | All | SELECT | Authenticated |

### Eagle Squares Table

| Policy | Who | Access | Condition |
|--------|-----|--------|-----------|
| Admins have full access | Admins | ALL | `is_admin()` |
| Alpha Oscars have full access | Alpha Oscars | ALL | `is_alpha_oscar()` |
| Authenticated users can view | All | SELECT | Authenticated |

### Incidents Table

| Policy | Who | Access | Condition |
|--------|-----|--------|-----------|
| Admins have full access | Admins | ALL | `is_admin()` |
| DOs can manage incidents for their journeys | Delta Oscars | ALL | Journey assigned to DO |
| Authenticated users can view | All | SELECT | Authenticated |

---

## UI Components

### 1. **CallSignUpdater Component**

Location: `components/journeys/CallSignUpdater.tsx`

**Purpose**: Allows DOs to update journey status with a visual timeline

**Features**:
- Shows current status with icon and color
- Displays scheduled vs actual times
- Provides buttons for next valid status transitions
- Automatic timestamp tracking
- Real-time updates

**Usage**:
```tsx
<CallSignUpdater 
  journey={journey} 
  onUpdate={() => loadJourneys()} 
/>
```

### 2. **My Assignments Page**

Location: `app/(dashboard)/my-assignments/page.tsx`

**Purpose**: Dashboard for DOs to view and manage their assignments

**Features**:
- Lists all assigned journeys
- Shows full papa details (phone, email, special requirements)
- Tabs for active vs completed journeys
- Integrated call sign updater
- Stats overview

**Access**: Visible only to Delta Oscars

---

## Implementation Steps

### Step 1: Run the RBAC Migration

```bash
# In Supabase SQL Editor
# Run: docs/RBAC_PERMISSIONS_SYSTEM.sql
```

This will:
- Create helper functions
- Set up RLS policies
- Add `assigned_do_id` column to journeys
- Grant necessary permissions

### Step 2: Assign Oscars to Users

```sql
-- Update existing users with their oscar designation
UPDATE users SET oscar = 'delta_oscar' WHERE role = 'delta_oscar';
UPDATE users SET oscar = 'tango_oscar' WHERE id = 'user-id-here';
UPDATE users SET oscar = 'alpha_oscar' WHERE id = 'user-id-here';
```

### Step 3: Assign DOs to Journeys

**Via SQL**:
```sql
SELECT assign_do_to_journey(
  'journey-uuid-here',
  'do-user-uuid-here'
);
```

**Via TypeScript**:
```typescript
await supabase.rpc('assign_do_to_journey', {
  journey_uuid: journeyId,
  do_uuid: doUserId
})
```

### Step 4: Update Sidebar Navigation

Add "My Assignments" link for DOs:

```tsx
{
  name: "My Assignments",
  href: "/my-assignments",
  icon: Navigation,
  roles: ["delta_oscar"] // Only show to DOs
}
```

---

## Testing Checklist

### For Admins:
- [ ] Can view all papas, journeys, cheetahs, eagle squares
- [ ] Can create/update/delete all resources
- [ ] Can assign DOs to journeys
- [ ] Can view all incidents

### For Delta Oscars:
- [ ] Can view only assigned journeys
- [ ] Can see full papa details for assigned journeys
- [ ] Can update journey status via call signs
- [ ] Cannot view other DOs' assignments
- [ ] Cannot manage cheetahs or eagle squares

### For Tango Oscars:
- [ ] Can create/update/delete cheetahs
- [ ] Can view all journeys
- [ ] Cannot manage eagle squares
- [ ] Cannot assign DOs

### For Alpha Oscars:
- [ ] Can create/update/delete eagle squares
- [ ] Can view all journeys
- [ ] Cannot manage cheetahs
- [ ] Cannot assign DOs

---

## Security Considerations

1. **RLS Enforcement**: All policies use `SECURITY DEFINER` functions to ensure consistent security checks

2. **Audit Trail**: All updates via `update_journey_call_sign` are logged with timestamps

3. **Data Isolation**: DOs can only access data for their assigned journeys - no cross-contamination

4. **Read-Only Reference Data**: All users can view reference data (papas, nests, etc.) but only authorized roles can modify

5. **Function Permissions**: Helper functions are granted to `authenticated` role only

---

## Troubleshooting

### Issue: DO cannot see assigned journeys

**Check**:
1. User has `oscar = 'delta_oscar'` in users table
2. Journey has `assigned_do_id` set to the DO's user ID
3. User is `is_active = true`

**Fix**:
```sql
-- Verify assignment
SELECT j.id, j.assigned_do_id, u.full_name, u.oscar
FROM journeys j
LEFT JOIN users u ON u.id = j.assigned_do_id
WHERE j.id = 'journey-id-here';

-- Assign if missing
SELECT assign_do_to_journey('journey-id', 'do-user-id');
```

### Issue: TO cannot manage cheetahs

**Check**:
1. User has `oscar = 'tango_oscar'`
2. RLS policies are enabled on cheetahs table

**Fix**:
```sql
-- Verify oscar
SELECT id, full_name, oscar FROM users WHERE id = auth.uid();

-- Update if needed
UPDATE users SET oscar = 'tango_oscar' WHERE id = 'user-id-here';
```

### Issue: AO cannot manage eagle squares

**Check**:
1. User has `oscar = 'alpha_oscar'`
2. RLS policies are enabled on eagle_squares table

**Fix**:
```sql
-- Verify oscar
SELECT id, full_name, oscar FROM users WHERE id = auth.uid();

-- Update if needed
UPDATE users SET oscar = 'alpha_oscar' WHERE id = 'user-id-here';
```

---

## Future Enhancements

1. **Bulk Assignment**: UI for admins to assign multiple journeys to DOs
2. **Handoff System**: Allow DOs to transfer assignments
3. **Notification System**: Alert DOs when assigned to new journeys
4. **Mobile App**: Dedicated mobile interface for DOs in the field
5. **Geofencing**: Auto-update status based on GPS location
6. **Analytics Dashboard**: Track DO performance and journey metrics

---

## API Reference

### Check User Role

```typescript
const { data: isAdmin } = await supabase.rpc('is_admin')
const { data: isDO } = await supabase.rpc('is_delta_oscar')
const { data: isTO } = await supabase.rpc('is_tango_oscar')
const { data: isAO } = await supabase.rpc('is_alpha_oscar')
```

### Assign DO to Journey

```typescript
const { error } = await supabase.rpc('assign_do_to_journey', {
  journey_uuid: journeyId,
  do_uuid: doUserId
})
```

### Update Journey Status

```typescript
const { data, error } = await supabase.rpc('update_journey_call_sign', {
  journey_uuid: journeyId,
  new_status: 'first_course' // or 'in_progress', 'completed', 'cancelled'
})
```

### Query Assigned Journeys

```typescript
const { data, error } = await supabase
  .from('journeys')
  .select(`
    *,
    papas:papa_id (*)
  `)
  .eq('assigned_do_id', userId)
```

---

## Support

For questions or issues with the RBAC system:
1. Check this documentation
2. Review `docs/RBAC_PERMISSIONS_SYSTEM.sql` for policy details
3. Check browser console for error messages
4. Verify user roles and oscars in database
