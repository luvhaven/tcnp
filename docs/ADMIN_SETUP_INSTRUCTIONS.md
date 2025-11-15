# Admin Account Setup Instructions

## Overview
This guide walks you through setting up the Super Admin and Admin accounts for TCNP Journey Management.

---

## Step 1: Create Auth Users in Supabase

1. **Log in to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `tcnp-journey-management`

2. **Navigate to Authentication**
   - In the left sidebar, click **Authentication**
   - Click **Users** tab
   - Click **Add User** button (top right)

3. **Create Super Admin Account**
   - Email: `doriazowan@gmail.com`
   - Password: `&DannyDev1&`
   - Click **Create User**
   - ✅ Confirm the user appears in the users list

4. **Create Admin Account**
   - Click **Add User** again
   - Email: `tcnpjourney@outlook.com`
   - Password: `$Command001`
   - Click **Create User**
   - ✅ Confirm the user appears in the users list

---

## Step 2: Run the Seed Script

1. **Open SQL Editor**
   - In Supabase Dashboard, click **SQL Editor** in the left sidebar
   - Click **New Query**

2. **Copy and Paste the Seed Script**
   - Open `docs/SEED_ADMIN_ACCOUNTS.sql` from your project
   - Copy the entire contents
   - Paste into the SQL Editor

3. **Execute the Script**
   - Click **Run** (or press Ctrl+Enter)
   - ✅ You should see success messages:
     ```
     ✓ Super Admin account configured: doriazowan@gmail.com
     ✓ Admin account configured: tcnpjourney@outlook.com (COMMAND 001)
     ```

4. **Verify the Setup**
   - The script will display a summary table showing both accounts
   - Confirm both accounts have correct roles and details

---

## Step 3: Test Login

1. **Open the Application**
   - Navigate to http://localhost:3005 (or your dev server URL)
   - You should see the login page (without demo credentials)

2. **Test Super Admin Login**
   - Email: `doriazowan@gmail.com`
   - Password: `&DannyDev1&`
   - Click **Sign In**
   - ✅ Should redirect to dashboard with full access

3. **Test Admin Login**
   - Log out from Super Admin
   - Email: `tcnpjourney@outlook.com`
   - Password: `$Command001`
   - Click **Sign In**
   - ✅ Should redirect to dashboard with admin access

---

## Account Details

### Super Admin Account
- **Email:** doriazowan@gmail.com
- **Password:** &DannyDev1&
- **Full Name:** Daniel Oriazowan
- **Role:** super_admin
- **OSCAR:** Cannot be assigned (Super Admin privilege)
- **Permissions:**
  - ✓ Full system access
  - ✓ Manage all users
  - ✓ Create/edit/delete all entities
  - ✓ View audit logs
  - ✓ Manage system settings
  - ✓ Assign roles and titles
  - ✓ Activate/deactivate accounts

### Admin Account
- **Email:** tcnpjourney@outlook.com
- **Password:** $Command001
- **Full Name:** COMMAND 001
- **Role:** admin
- **OSCAR:** Command (Permanent, not reassignable)
- **Unit:** Command Center
- **Title:** Command Center Lead (Fixed)
- **Permissions:**
  - ✓ Manage users
  - ✓ Manage all entities
  - ✓ View audit logs
  - ✓ Manage programs, papas, journeys, vehicles
  - ✓ View tracking and reports

---

## Audit Logging

The system automatically tracks all user actions:

### What Gets Logged
- ✅ User creation, updates, deletions
- ✅ Program/event management
- ✅ Papa (guest) management
- ✅ Journey creation and status changes
- ✅ Vehicle (cheetah) assignments
- ✅ Title assignments
- ✅ Incident reports
- ✅ Flight tracking updates
- ✅ Location updates

### Audit Log Details
Each log entry includes:
- **Action:** create, update, delete
- **Target Type:** users, programs, papas, journeys, etc.
- **Target ID:** Unique identifier of affected record
- **User:** Full name, email, OSCAR, role
- **Timestamp:** When the action occurred
- **Changes:** Detailed JSON of what changed
- **Description:** Human-readable summary

### Viewing Audit Logs
1. Log in as Super Admin or Admin
2. Navigate to **Audit Logs** in the sidebar
3. View complete activity trail with:
   - User who performed the action
   - What was changed
   - When it happened
   - Detailed change data (expandable)

---

## Navigation & Features

All navigation and buttons are functional:

### Dashboard Sections
- **Dashboard** - Overview and statistics
- **Programs** - Event management
- **Papas** - Guest management
- **Journeys** - Journey tracking
- **Cheetahs** - Vehicle fleet
- **Officers** - Protocol officer management
- **Live Tracking** - Real-time location tracking
- **Nests** - Hotel management
- **Theatres** - Venue management
- **Eagle Squares** - Airport management
- **Incidents** - Incident reporting
- **Audit Logs** - Activity tracking
- **Settings** - System configuration

### Key Features
- ✅ Create, edit, delete operations
- ✅ Real-time updates
- ✅ Role-based access control
- ✅ Search and filtering
- ✅ Export functionality
- ✅ Live tracking maps
- ✅ Chat system
- ✅ Push notifications

---

## Troubleshooting

### Issue: Cannot log in
- Verify the user was created in Supabase Auth Dashboard
- Check that the seed script ran successfully
- Ensure password is entered exactly (case-sensitive)

### Issue: No audit logs appearing
- Perform some actions (create/edit records)
- Refresh the Audit Logs page
- Check that RLS policies allow viewing audit logs

### Issue: Missing permissions
- Verify the user's role in the database
- Run the seed script again to update roles
- Log out and log back in

---

## Security Notes

1. **Change Default Passwords**
   - After initial setup, change passwords via Supabase Auth Dashboard
   - Use strong, unique passwords

2. **OSCAR Assignment**
   - Super Admin cannot be assigned an OSCAR (by design)
   - Admin's OSCAR "Command" is permanent and cannot be reassigned

3. **Role Hierarchy**
   - super_admin > admin > captain > other roles
   - Only Super Admin can manage other admins

4. **Audit Trail**
   - All actions are logged automatically
   - Logs cannot be deleted by regular users
   - Provides complete accountability

---

## Next Steps

1. ✅ Create admin accounts in Supabase Auth
2. ✅ Run seed script to configure roles
3. ✅ Test login with both accounts
4. ✅ Explore dashboard features
5. ✅ Verify audit logging is working
6. 🔄 Add additional users as needed
7. 🔄 Configure system settings
8. 🔄 Import production data

---

## Support

For issues or questions:
- Check the audit logs for error details
- Review Supabase logs in the Dashboard
- Verify RLS policies are enabled
- Ensure all migrations have been applied
