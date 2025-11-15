# Super Admin Setup Guide

## 🎯 Objective
Set up `doriazowan@gmail.com` as the Super Admin with full system privileges.

---

## 📋 Step-by-Step Instructions

### Step 1: Create the Account (If Not Already Done)

1. **Open your app:** http://localhost:3001
2. **You'll be redirected to login page**
3. **If account doesn't exist yet:**
   - You need to sign up first (there's no signup page yet, see Step 1b below)
   
### Step 1b: Sign Up via Supabase Dashboard (Recommended)

Since there's no signup page in the app, create the account directly in Supabase:

1. **Go to Supabase Dashboard** → https://supabase.com/dashboard
2. **Select your project**
3. **Go to Authentication** → Users
4. **Click "Add User"** → "Create new user"
5. **Fill in:**
   - Email: `doriazowan@gmail.com`
   - Password: `&DannyDev1&` (or your preferred password)
   - Auto Confirm User: ✅ **Check this box**
6. **Click "Create user"**

### Step 2: Set Super Admin Role

After the user is created in Supabase Auth, you need to add them to the `users` table:

1. **Go to Supabase Dashboard** → SQL Editor
2. **Copy and paste this SQL:**

```sql
-- Insert user into users table with Super Admin role
INSERT INTO users (
  id, 
  email, 
  full_name, 
  phone, 
  role, 
  oscar,
  is_active, 
  activation_status
)
SELECT 
  id,
  'doriazowan@gmail.com',
  'Daniel Oriazowan',
  '+2348026381777',
  'super_admin',
  'OSCAR-ALPHA',
  true,
  'active'
FROM auth.users 
WHERE email = 'doriazowan@gmail.com'
ON CONFLICT (id) 
DO UPDATE SET
  role = 'super_admin',
  full_name = 'Daniel Oriazowan',
  phone = '+2348026381777',
  oscar = 'OSCAR-ALPHA',
  is_active = true,
  activation_status = 'active';

-- Verify the setup
SELECT 
  id,
  email,
  full_name,
  role,
  phone,
  oscar,
  is_active,
  activation_status
FROM users 
WHERE email = 'doriazowan@gmail.com';
```

3. **Click "Run"**
4. **Verify the result shows:**
   - Email: doriazowan@gmail.com
   - Role: super_admin
   - Full Name: Daniel Oriazowan
   - Phone: +2348026381777
   - OSCAR: OSCAR-ALPHA
   - Is Active: true
   - Activation Status: active

### Step 3: Login and Test

1. **Go to:** http://localhost:3001
2. **Login with:**
   - Email: `doriazowan@gmail.com`
   - Password: `&DannyDev1&` (or whatever you set)
3. **You should be redirected to Dashboard**
4. **Test Super Admin privileges:**
   - Navigate to "Manage Officers" - should have full access
   - Try creating a new user
   - Try changing user roles
   - Access all pages without restrictions

---

## 🔐 Super Admin Privileges

As Super Admin, `doriazowan@gmail.com` has:

✅ **Full System Access**
- View and manage all data
- Access all pages and features
- No restrictions on any operations

✅ **User Management**
- Create new Protocol Officers
- Edit any user's details
- Assign/change roles for any user
- Activate/deactivate accounts
- Delete accounts (except own account)

✅ **Entity Management**
- Create/Edit/Delete Papas (Guests)
- Create/Edit/Delete Cheetahs (Vehicles)
- Create/Edit/Delete Programs
- Create/Edit/Delete Journeys
- Manage all venues, hotels, airports

✅ **System Administration**
- View audit logs
- Manage system settings
- Access all tracking features
- Override any restrictions

✅ **Protected Status**
- Cannot be deleted by other users
- Cannot be deactivated by other users
- Highest level of authority

---

## 🛡️ Security Notes

1. **Password Security:**
   - Change the default password after first login
   - Use a strong, unique password
   - Enable 2FA if available

2. **Account Protection:**
   - Super Admin account cannot be deleted via the app
   - Only database-level access can modify Super Admin

3. **Role Hierarchy:**
   ```
   super_admin (Highest)
   ├── admin
   ├── captain
   ├── head_of_command
   ├── delta_oscar (DO)
   ├── tango_oscar (TO)
   ├── head_tango_oscar
   ├── alpha_oscar (AO)
   ├── november_oscar (NO)
   ├── victor_oscar (VO)
   ├── viewer
   ├── media
   └── external (Lowest)
   ```

---

## 🔧 Troubleshooting

### Issue: Can't login after creating account
**Solution:** Make sure you checked "Auto Confirm User" when creating the account in Supabase, or verify the email.

### Issue: User exists but shows as "viewer" role
**Solution:** Run the SQL script in Step 2 again to update the role to super_admin.

### Issue: "User not found" error
**Solution:** The user exists in auth.users but not in the users table. Run the INSERT SQL from Step 2.

### Issue: Can't access "Manage Officers" page
**Solution:** 
1. Check your role in the database
2. Make sure role is exactly 'super_admin' (lowercase, underscore)
3. Verify is_active = true and activation_status = 'active'

---

## 📞 Account Details

**Super Admin Profile:**
- **Name:** Daniel Oriazowan
- **Email:** doriazowan@gmail.com
- **Phone:** +2348026381777
- **OSCAR Call Sign:** OSCAR-ALPHA
- **Role:** super_admin
- **Status:** Active

---

## ✅ Verification Checklist

After setup, verify these work:

- [ ] Can login successfully
- [ ] Dashboard loads with data
- [ ] Can access "Manage Officers" page
- [ ] Can create new Protocol Officers
- [ ] Can change user roles
- [ ] Can activate/deactivate users
- [ ] Can access all navigation items
- [ ] Profile shows as "Super Admin"
- [ ] Can manage Programs
- [ ] Can manage Papas and Cheetahs
- [ ] Can access Vehicle Tracking
- [ ] Can access Flight Tracking

---

## 🎉 Success!

Once all checks pass, your Super Admin account is fully set up and ready to use!

You now have complete control over the TCNP Journey Management system.
