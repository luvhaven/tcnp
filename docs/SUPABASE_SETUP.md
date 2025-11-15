# TCNP Journey Management - Detailed Supabase Setup Guide

## ✅ What You've Done So Far

Great! You've already completed:
1. ✅ Created Supabase account
2. ✅ Created project "tcnp-journey-management"
3. ✅ Ran DATABASE_SCHEMA.sql (Success!)
4. ✅ Ran SEED_DATA.sql (Success!)

**"Success. No rows returned"** is the CORRECT message! It means your database is now set up with all tables and sample data.

---

## 📋 Step 1: Verify Your Database Tables Were Created

Let's confirm everything worked:

### 1.1 Check Your Tables

1. In your Supabase dashboard, look at the **LEFT SIDEBAR**
2. Click on **"Table Editor"** (it has a table/grid icon)
3. You should now see a dropdown list of tables

**You should see these 15 tables:**
- audit_logs
- cheetahs
- eagle_squares
- incidents
- journey_events
- journeys
- nests
- notification_templates
- notifications
- papas
- roles
- settings
- telemetry_data
- theatres
- users

### 1.2 Verify Sample Data

1. Still in **Table Editor**, click on the **"papas"** table
2. You should see **6 rows** of data (6 guest ministers)
3. Click on **"cheetahs"** table
4. You should see **5 rows** (5 vehicles)
5. Click on **"journeys"** table
6. You should see **4 rows** (4 sample journeys)

**If you see this data, your database is perfectly set up!** ✅

---

## 📋 Step 2: Get Your Supabase Credentials

Now we need to get 3 important values to put in your `.env.local` file.

### 2.1 Open Project Settings

1. In the **LEFT SIDEBAR**, scroll down to the bottom
2. Click on the **⚙️ Settings** icon (gear icon)
3. In the Settings menu that appears, click on **"API"**

### 2.2 Copy Your Project URL

1. You'll see a section called **"Project URL"**
2. It looks like: `https://abcdefghijklmnop.supabase.co`
3. Click the **COPY** button next to it (📋 icon)
4. **Save this somewhere** - you'll need it in a moment

### 2.3 Copy Your Anon/Public Key

1. Scroll down to the section called **"Project API keys"**
2. You'll see two keys:
   - `anon` `public` (this is safe to use in your app)
   - `service_role` `secret` (this is sensitive!)

3. Find the **"anon"** key (it's labeled `anon` `public`)
4. Click the **COPY** button (📋 icon) next to it
5. **Save this somewhere** - you'll need it next

### 2.4 Copy Your Service Role Key

1. Still in the **"Project API keys"** section
2. Find the **"service_role"** key (it's labeled `service_role` `secret`)
3. Click **"Reveal"** to show the key
4. Click the **COPY** button (📋 icon)
5. **Save this somewhere** - you'll need it next

**⚠️ IMPORTANT:** Never share your service_role key publicly!

---

## 📋 Step 3: Create Your .env.local File

Now let's set up your environment variables.

### 3.1 Create the File

1. Open your terminal
2. Navigate to your project:
   ```bash
   cd /Users/adeola/CascadeProjects/tcnp-journey-management
   ```

3. Create the `.env.local` file by copying the example:
   ```bash
   cp .env.local.example .env.local
   ```

### 3.2 Edit the File

1. Open `.env.local` in your code editor (VS Code, etc.)
2. You'll see this:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. **Replace the values** with what you copied:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYyMzM2MjQwMCwiZXhwIjoxOTM4OTM4NDAwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjIzMzYyNDAwLCJleHAiOjE5Mzg5Mzg0MDB9.yyyyyyyyyyyyyyyyyyyyyyyyyyyy

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **Save the file** (Cmd+S on Mac, Ctrl+S on Windows)

**Leave the rest of the file as-is** (SMTP, Twilio, etc. are optional)

---

## 📋 Step 4: Enable Real-time Features

This makes your app update live when data changes!

### 4.1 Go to Database Publications

1. In Supabase dashboard, **LEFT SIDEBAR**
2. Click on **"Database"** (database icon)
3. In the submenu, click **"Publications"** (NOT "Replication")

**Note:** If you see "Replication" with "Request early access", ignore that - it's a different feature.

### 4.2 Find the "supabase_realtime" Publication

1. You should see a publication called **"supabase_realtime"**
2. This is the default publication that controls which tables broadcast real-time changes
3. Click on **"supabase_realtime"** to open it

### 4.3 Add Tables to Real-time Publication

You'll see a list of tables. We need to enable real-time for specific ones:

**Tables to enable:**
- journeys
- journey_events
- cheetahs
- telemetry_data
- users
- notifications
- incidents

**Steps to add each table:**

1. Look for a button that says **"Add table"** or **"Edit publication"**
2. Click it
3. You'll see a list of all your tables with checkboxes
4. **Check the boxes** for these 7 tables:
   - ☑️ journeys
   - ☑️ journey_events
   - ☑️ cheetahs
   - ☑️ telemetry_data
   - ☑️ users
   - ☑️ notifications
   - ☑️ incidents
5. Click **"Save"** or **"Update publication"**

### 4.4 Verify Real-time is Enabled

1. After saving, you should see the 7 tables listed under the "supabase_realtime" publication
2. Each table should show which events are enabled (INSERT, UPDATE, DELETE)

**If you don't see a "Publications" option:**

Real-time might already be enabled by default! You can verify by:
1. Going to **"Table Editor"**
2. Click on any table (e.g., "journeys")
3. Look for a "Realtime" section or toggle in the table settings
4. If you see it, enable it for the 7 tables listed above

**Alternative: Enable via SQL (if Publications UI is confusing)**

1. Go to **SQL Editor** (LEFT SIDEBAR)
2. Click **"New query"**
3. Paste this SQL:

```sql
-- Enable real-time for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE journeys;
ALTER PUBLICATION supabase_realtime ADD TABLE journey_events;
ALTER PUBLICATION supabase_realtime ADD TABLE cheetahs;
ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_data;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
```

4. Click **"Run"** (or press Cmd+Enter / Ctrl+Enter)
5. You should see "Success. No rows returned" for each line

This SQL command adds the tables to the real-time publication, which enables real-time updates.

---

## 📋 Step 5: Create Storage Buckets

Storage buckets are for uploading files (avatars, documents, logos).

### 5.1 Go to Storage

1. In **LEFT SIDEBAR**, click on **"Storage"** (folder icon)
2. You'll see a page that says "No buckets yet" or shows existing buckets

### 5.2 Create "avatars" Bucket

1. Click the **"New bucket"** button (top right)
2. A form will appear with these fields:

**Fill in:**
- **Name:** `avatars` (exactly this, lowercase)
- **Public bucket:** ✅ **CHECK THIS BOX** (toggle it ON)
- **File size limit:** `2` MB
- **Allowed MIME types:** `image/*`

3. Click **"Create bucket"**

### 5.3 Create "documents" Bucket

1. Click **"New bucket"** again
2. Fill in:

- **Name:** `documents` (exactly this, lowercase)
- **Public bucket:** ❌ **LEAVE THIS UNCHECKED** (toggle OFF)
- **File size limit:** `10` MB
- **Allowed MIME types:** `application/pdf,image/*`

3. Click **"Create bucket"**

### 5.4 Create "logos" Bucket

1. Click **"New bucket"** again
2. Fill in:

- **Name:** `logos` (exactly this, lowercase)
- **Public bucket:** ✅ **CHECK THIS BOX** (toggle ON)
- **File size limit:** `2` MB
- **Allowed MIME types:** `image/*`

3. Click **"Create bucket"**

### 5.5 Verify Buckets

You should now see **3 buckets** in your Storage page:
- avatars (Public)
- documents (Private)
- logos (Public)

---

## 📋 Step 6: Create Your Super Admin User

This is your main login account!

### 6.1 Go to Authentication

1. In **LEFT SIDEBAR**, click on **"Authentication"** (person icon)
2. Click on **"Users"** in the submenu

### 6.2 Add User

1. Click the **"Add user"** button (top right)
2. A dropdown will appear, select **"Create new user"**
3. A form will appear

### 6.3 Fill in User Details

**Enter EXACTLY these values:**
- **Email:** `doriazowan@gmail.com`
- **Password:** `&DannyDev1&`
- **Auto Confirm User:** ✅ **CHECK THIS BOX**

4. Click **"Create user"**

### 6.4 Verify User Was Created

1. You should see the user appear in the users list
2. Email: `doriazowan@gmail.com`
3. Status: Should show as "Confirmed" or have a green checkmark

### 6.5 Important: User Profile Creation

The user profile in the `users` table will be created automatically when you first log in to the app. The database has triggers set up for this.

---

## 📋 Step 7: Configure Authentication Settings

### 7.1 Go to Auth Settings

1. Still in **Authentication** section
2. Click on **"URL Configuration"** in the submenu

### 7.2 Set Site URL

1. Find the **"Site URL"** field
2. Enter: `http://localhost:3000`
3. Click **"Save"**

### 7.3 Set Redirect URLs

1. Find the **"Redirect URLs"** section
2. Add these URLs (click "Add URL" for each):
   - `http://localhost:3000/**`
   - `http://localhost:3000/auth/callback`

3. Click **"Save"**

---

## 📋 Step 8: Verify Everything is Set Up

Let's do a final check!

### 8.1 Database Checklist

Go to **Table Editor** and verify:
- ✅ You see 15 tables
- ✅ `papas` table has 6 rows
- ✅ `cheetahs` table has 5 rows
- ✅ `journeys` table has 4 rows
- ✅ `roles` table has 13 rows
- ✅ `eagle_squares` table has 2 rows
- ✅ `nests` table has 3 rows
- ✅ `theatres` table has 2 rows

### 8.2 Real-time Checklist

Go to **Database → Replication** and verify:
- ✅ `journeys` - Real-time enabled
- ✅ `journey_events` - Real-time enabled
- ✅ `cheetahs` - Real-time enabled
- ✅ `telemetry_data` - Real-time enabled
- ✅ `users` - Real-time enabled
- ✅ `notifications` - Real-time enabled
- ✅ `incidents` - Real-time enabled

### 8.3 Storage Checklist

Go to **Storage** and verify:
- ✅ `avatars` bucket exists (Public)
- ✅ `documents` bucket exists (Private)
- ✅ `logos` bucket exists (Public)

### 8.4 Authentication Checklist

Go to **Authentication → Users** and verify:
- ✅ User `doriazowan@gmail.com` exists
- ✅ User status is "Confirmed"

### 8.5 Environment Variables Checklist

Check your `.env.local` file has:
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Your project URL
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your anon key
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Your service role key
- ✅ `NEXT_PUBLIC_APP_URL` - Set to `http://localhost:3000`

---

## 📋 Step 9: Install Dependencies and Run the App

Now let's get your app running!

### 9.1 Open Terminal

1. Open your terminal/command prompt
2. Navigate to your project:
   ```bash
   cd /Users/adeola/CascadeProjects/tcnp-journey-management
   ```

### 9.2 Install Dependencies

Run this command:
```bash
npm install
```

**What you'll see:**
- Lots of text scrolling
- Some warnings (these are normal and safe to ignore)
- "added 511 packages, and audited 512 packages in 2m" at the end
- This takes 2-5 minutes

**Wait until you see:** `added XXX packages, and audited XXX packages in XXs`

**If you see a dependency conflict error:**
This has already been fixed in the package.json, but if you still see an error about React versions, run:
```bash
npm install --legacy-peer-deps
```

### 9.3 Start Development Server

Run this command:
```bash
npm run dev
```

**What you'll see:**
```
  ▲ Next.js 15.0.3
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 2.3s
```

**Don't close this terminal!** Keep it running.

---

## 📋 Step 10: Test Your Login

### 10.1 Open the App

1. Open your web browser (Chrome, Safari, Firefox, etc.)
2. Go to: `http://localhost:3000`

### 10.2 You Should See

A beautiful login page with:
- "TCNP Journey Management" title
- Email and Password fields
- "Sign In" button
- Demo credentials shown at the bottom

### 10.3 Login

1. **Email:** `doriazowan@gmail.com`
2. **Password:** `&DannyDev1&`
3. Click **"Sign In"**

### 10.4 What Happens Next

**If successful:**
- You'll see a success message
- You'll be redirected to `/dashboard`
- You might see a basic page or loading state

**If you see an error:**
- Check your `.env.local` file
- Make sure Supabase URL and keys are correct
- Check the terminal for error messages

---

## 🎉 Success! What You've Accomplished

You now have:
- ✅ Complete database with 15 tables
- ✅ Sample data (6 Papas, 5 vehicles, 4 journeys)
- ✅ Real-time features enabled
- ✅ Storage buckets for files
- ✅ Super admin user account
- ✅ App running locally
- ✅ Successful login

---

## 🔍 Troubleshooting Common Issues

### Issue 1: "Cannot find module" errors

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: Login fails with "Invalid credentials"

**Check:**
1. Email is exactly: `doriazowan@gmail.com`
2. Password is exactly: `&DannyDev1&` (case-sensitive!)
3. User exists in Supabase → Authentication → Users

### Issue 3: "Failed to connect to Supabase"

**Check:**
1. `.env.local` file exists in project root
2. `NEXT_PUBLIC_SUPABASE_URL` is correct
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
4. No extra spaces in the values

### Issue 4: Tables not showing in Supabase

**Solution:**
1. Go to SQL Editor
2. Run `docs/DATABASE_SCHEMA.sql` again
3. Check for any error messages in red

### Issue 5: No sample data in tables

**Solution:**
1. Go to SQL Editor
2. Run `docs/SEED_DATA.sql` again
3. Check Table Editor → papas (should have 6 rows)

---

## 📞 Next Steps

Now that your app is running:

1. **Explore the database:**
   - Go to Supabase Table Editor
   - Click through different tables
   - See the sample data

2. **Check the terminal:**
   - Look for any error messages
   - Keep it running while developing

3. **Ready for development:**
   - The foundation is complete
   - Next: Build dashboard pages
   - Next: Add UI components

---

## 📝 Quick Reference

### Your Supabase Dashboard URLs

- **Main Dashboard:** `https://app.supabase.com/project/[your-project-id]`
- **Table Editor:** `https://app.supabase.com/project/[your-project-id]/editor`
- **SQL Editor:** `https://app.supabase.com/project/[your-project-id]/sql`
- **Authentication:** `https://app.supabase.com/project/[your-project-id]/auth/users`
- **Storage:** `https://app.supabase.com/project/[your-project-id]/storage/buckets`

### Your Local App URLs

- **App:** `http://localhost:3000`
- **Login:** `http://localhost:3000/login`
- **Dashboard:** `http://localhost:3000/dashboard` (after login)

### Important Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Stop server
# Press Ctrl+C in terminal

# Check for errors
npm run type-check

# Build for production
npm run build
```

---

## ✅ Verification Checklist

Before moving forward, confirm:

- [ ] Supabase project created
- [ ] DATABASE_SCHEMA.sql ran successfully
- [ ] SEED_DATA.sql ran successfully
- [ ] 15 tables visible in Table Editor
- [ ] Sample data visible (6 papas, 5 cheetahs, etc.)
- [ ] Real-time enabled for 7 tables
- [ ] 3 storage buckets created
- [ ] Super admin user created
- [ ] `.env.local` file created with correct values
- [ ] `npm install` completed successfully
- [ ] `npm run dev` running without errors
- [ ] Can access `http://localhost:3000`
- [ ] Can login with super admin credentials
- [ ] No error messages in terminal

**If all checked, you're ready to build the dashboard!** 🚀

---

**Need Help?**
- Check terminal for error messages
- Check browser console (F12 → Console tab)
- Review this guide step-by-step
- Verify each checklist item
