# Testing Checklist - Chat System & Schema Fixes

## Prerequisites
1. Run `docs/FIX_SCHEMA_CACHE_ERRORS.sql` in Supabase SQL Editor
2. Ensure `docs/MIGRATION_CHAT_AND_PWA.sql` has been executed
3. Have at least 2 test user accounts ready

## Schema Fixes Verification

### Test 1: Create Hotel (Nest)
- [ ] Navigate to Nests page
- [ ] Click "Add Hotel"
- [ ] Fill in all fields including email
- [ ] Submit form
- [ ] **Expected**: Hotel created successfully without "email column not found" error

### Test 2: Create Papa (Guest)
- [ ] Navigate to Papas page
- [ ] Click "Add Papa"
- [ ] Fill in required fields
- [ ] Submit form
- [ ] **Expected**: Papa created successfully without "event_id column not found" error

## Chat System Verification

### Test 3: Real-time Message Delivery
- [ ] Open chat page in two browser windows (different accounts)
- [ ] Send message from Account A
- [ ] **Expected**: Message appears instantly in Account B without refresh
- [ ] Send message from Account B
- [ ] **Expected**: Message appears instantly in Account A without refresh

### Test 4: Public Messages (Team Chat)
- [ ] Account A: Send a message without any mentions
- [ ] **Expected**: All online users can see the message
- [ ] **Expected**: Message shows sender name, oscar, and timestamp

### Test 5: @Mention Messages
- [ ] Account A: Type `@` and select a user from dropdown
- [ ] Send the message
- [ ] **Expected**: Mentioned user (Account B) sees the message
- [ ] **Expected**: All other users also see the message (public mention)
- [ ] **Expected**: Notification created for mentioned user

### Test 6: @@Private Messages
- [ ] Account A: Type `@@` and select a user from dropdown
- [ ] Send the message
- [ ] **Expected**: Only sender and mentioned user can see the message
- [ ] **Expected**: Other users cannot see this private message
- [ ] **Expected**: Lock icon appears on private messages

### Test 7: Unread Badge
- [ ] Account B: Navigate away from chat page
- [ ] Account A: Send a message
- [ ] Account B: Check sidebar
- [ ] **Expected**: Unread badge appears on "Team Chat" link
- [ ] Account B: Open chat page
- [ ] **Expected**: Badge count decreases or disappears

### Test 8: Read Receipts
- [ ] Account A: Send a message
- [ ] Account B: View the message
- [ ] **Expected**: Message marked as read automatically
- [ ] **Expected**: Unread count updates in real-time

### Test 9: Online Presence
- [ ] Account A: Open chat page
- [ ] Account B: Open chat page
- [ ] **Expected**: Both users show as online in user list
- [ ] Account B: Close browser/tab
- [ ] **Expected**: Account B shows as offline after ~30 seconds

### Test 10: Message History
- [ ] Send multiple messages
- [ ] Refresh the page
- [ ] **Expected**: All messages load correctly
- [ ] **Expected**: No null reference errors in console
- [ ] **Expected**: Messages show correct sender information

## Error Handling

### Test 11: Network Issues
- [ ] Open DevTools Network tab
- [ ] Throttle to "Slow 3G"
- [ ] Send a message
- [ ] **Expected**: Message eventually sends with appropriate feedback
- [ ] **Expected**: No crashes or unhandled errors

### Test 12: Invalid Data
- [ ] Try to send empty message
- [ ] **Expected**: Send button disabled or validation message shown
- [ ] Try to mention non-existent user
- [ ] **Expected**: Graceful handling without errors

## Console Checks
- [ ] No TypeScript errors in browser console
- [ ] No "Cannot read properties of null" errors
- [ ] Realtime subscription shows "Chat realtime subscription active"
- [ ] No repeated error messages

## Performance
- [ ] Chat loads within 2 seconds
- [ ] Messages appear within 1 second of sending
- [ ] No lag when typing or scrolling
- [ ] Presence updates within 30 seconds

## Notes
- If any test fails, check browser console for errors
- Verify Supabase RLS policies are correctly applied
- Ensure realtime is enabled in Supabase project settings
- Check that all migrations have been run in correct order
