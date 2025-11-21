# Troubleshooting Guide - Chat & Papa Issues

## Chat System Issues

### Issue 1: Messages Not Sending / "Unknown User" Displayed

**Symptoms:**
- Messages don't appear for other users
- Sender shows as "Unknown User"
- Poor user experience in chat

**Root Causes:**
1. User not properly authenticated
2. RLS policies blocking message insertion
3. Realtime subscription not active
4. User data not being fetched with messages

**Debugging Steps:**

1. **Check Browser Console:**
   - Open DevTools (F12) → Console tab
   - Look for these messages:
     - ✅ "Chat realtime subscription active" - Good!
     - ❌ "Error sending message" - Check the error details
     - ❌ "You must be logged in to send messages" - Auth issue

2. **Verify Authentication:**
   ```javascript
   // In browser console:
   const { data: { user } } = await supabase.auth.getUser()
   console.log('Current user:', user)
   ```
   - Should show user object with `id`, `email`, etc.
   - If null, user is not logged in

3. **Check RLS Policies:**
   - Go to Supabase Dashboard → Authentication → Policies
   - Verify `chat_messages` table has:
     - ✅ `active_users_insert_messages` - FOR INSERT
     - ✅ `users_view_messages` - FOR SELECT
   - Check if user's `is_active` is `true` in `users` table

4. **Test Message Payload:**
   - Look for console log: "Sending message: {...}"
   - Verify payload has:
     - `sender_id` (UUID)
     - `content` (string)
     - `mentions` (array)
     - `is_private` (boolean)
     - `program_id` (UUID or null)

5. **Check Realtime Subscription:**
   - Look for: "Realtime payload received: INSERT"
   - If missing, realtime is not working
   - Verify Supabase project has Realtime enabled

**Solutions:**

✅ **Solution 1: Ensure User is Loaded**
- The chat now checks `currentUser?.id` before sending
- If you see "You must be logged in", refresh the page

✅ **Solution 2: Check RLS Policies**
- Run this in Supabase SQL Editor:
```sql
-- Check if user can insert messages
SELECT 
  u.id, 
  u.email, 
  u.is_active,
  u.role
FROM users u
WHERE u.id = auth.uid();

-- If is_active is false, update it:
UPDATE users SET is_active = true WHERE id = auth.uid();
```

✅ **Solution 3: Enable Realtime**
- Supabase Dashboard → Database → Replication
- Enable replication for `chat_messages` table

✅ **Solution 4: Clear Cache and Reload**
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache
- Log out and log back in

---

## Papa Creation Error

### Issue 2: "Error saving papa: {}" - Empty Error Object

**Symptoms:**
- Creating or updating Papa fails
- Console shows `Error saving papa: {}`
- No helpful error message

**Root Causes:**
1. Missing required fields
2. RLS policy blocking insert/update
3. Foreign key constraint violation (e.g., invalid `program_id`)
4. Data type mismatch (e.g., string instead of UUID)

**Debugging Steps:**

1. **Check Enhanced Console Logs:**
   - Look for: "Papa form data received: {...}"
   - Look for: "Papa data to save: {...}"
   - Look for: "Supabase insert error: {...}"
   - The enhanced logging will show:
     - Error message
     - Error hint
     - Error details
     - Error keys

2. **Verify Required Fields:**
   - `full_name` - Required (TEXT)
   - `program_id` - Optional (UUID)
   - All other fields are optional

3. **Check RLS Policies:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT 
     u.id, 
     u.role,
     has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command', 'delta_oscar']::user_role[]) as can_manage_papas
   FROM users u
   WHERE u.id = auth.uid();
   ```
   - `can_manage_papas` should be `true`

4. **Test Direct Insert:**
   ```sql
   -- Run in Supabase SQL Editor
   INSERT INTO papas (full_name, program_id)
   VALUES ('Test Papa', NULL);
   ```
   - If this fails, check the error message

**Solutions:**

✅ **Solution 1: Check User Role**
- Only these roles can create/update papas:
  - `super_admin`
  - `admin`
  - `captain`
  - `head_of_command`
  - `delta_oscar`
- Update user role if needed:
```sql
UPDATE users SET role = 'admin' WHERE id = auth.uid();
```

✅ **Solution 2: Validate Program ID**
- If selecting a program, ensure it exists:
```sql
SELECT id, name FROM programs ORDER BY name;
```
- Use `NULL` for no program

✅ **Solution 3: Check for Missing Columns**
- Run `docs/FIX_SCHEMA_CACHE_ERRORS.sql`
- This ensures `program_id` exists and `event_id` is migrated

✅ **Solution 4: Review Console Logs**
- The enhanced error logging will now show:
  - `error.message` - Human-readable error
  - `error.hint` - Suggestion from Postgres
  - `error.details` - Additional context
  - `error.code` - Postgres error code

---

## General Debugging Tips

### Enable Verbose Logging
1. Open browser DevTools (F12)
2. Go to Console tab
3. Enable all log levels (Verbose, Info, Warnings, Errors)
4. Reproduce the issue
5. Copy console output for analysis

### Check Supabase Logs
1. Go to Supabase Dashboard
2. Click "Logs" in sidebar
3. Select "Postgres Logs" or "API Logs"
4. Look for errors around the time of the issue

### Test with Different Users
- Create a test user with `super_admin` role
- Try the same action
- If it works, it's an RLS/permissions issue

### Verify Database State
```sql
-- Check chat messages
SELECT 
  cm.id,
  cm.content,
  cm.sender_id,
  u.full_name,
  u.oscar,
  cm.created_at
FROM chat_messages cm
LEFT JOIN users u ON u.id = cm.sender_id
ORDER BY cm.created_at DESC
LIMIT 10;

-- Check papas
SELECT 
  p.id,
  p.full_name,
  p.program_id,
  pr.name as program_name
FROM papas p
LEFT JOIN programs pr ON pr.id = p.program_id
ORDER BY p.created_at DESC
LIMIT 10;
```

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "You must be logged in to send messages" | User not authenticated | Refresh page, log in again |
| "Failed to send message" | RLS policy blocking | Check user `is_active` and role |
| "Chat realtime subscription error" | Realtime not enabled | Enable in Supabase Dashboard |
| "Error saving papa: {}" | Various (now has better logging) | Check enhanced console logs |
| "Could not find the 'program_id' column" | Schema out of sync | Run `FIX_SCHEMA_CACHE_ERRORS.sql` |
| "new row violates row-level security policy" | User lacks permissions | Update user role |

---

## Still Having Issues?

1. **Check Migration Status:**
   - Verify `docs/MIGRATION_CHAT_AND_PWA.sql` was run successfully
   - Verify `docs/FIX_SCHEMA_CACHE_ERRORS.sql` was run successfully

2. **Review Testing Checklist:**
   - Follow `docs/TESTING_CHECKLIST.md` step by step

3. **Collect Debug Info:**
   - Browser console logs
   - Supabase error logs
   - User role and permissions
   - Database table structure

4. **Reset and Retry:**
   - Log out and log back in
   - Clear browser cache
   - Hard refresh (Ctrl+Shift+R)
   - Try in incognito/private window
