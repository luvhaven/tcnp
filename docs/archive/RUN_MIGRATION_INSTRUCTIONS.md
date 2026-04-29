# How to Run MIGRATION_PHASE3.sql

## ⚠️ IMPORTANT: This must be run in Supabase Dashboard, not via CLI

## Steps:

### 1. Open Supabase Dashboard
- Go to: https://supabase.com/dashboard
- Login to your account
- Select your TCNP Journey Management project

### 2. Navigate to SQL Editor
- Click on "SQL Editor" in the left sidebar
- Click "New Query" button

### 3. Copy the Migration SQL
- Open: `/docs/MIGRATION_PHASE3.sql`
- Select ALL content (Cmd+A)
- Copy (Cmd+C)

### 4. Paste and Run
- Paste into Supabase SQL Editor (Cmd+V)
- Click "Run" button (or press Cmd+Enter)
- Wait for execution to complete

### 5. Verify Results
At the bottom of the results, you should see:
```
Programs table created    | count: 3
Papas inserted           | count: 6
Cheetahs inserted        | count: 5
Eagle Squares inserted   | count: 3
Nests inserted          | count: 3
Theatres inserted       | count: 3
```

## What This Migration Does:

✅ Creates `programs` table
✅ Adds `fuel_status` and `program_id` to cheetahs
✅ Adds `program_id` to journeys and papas
✅ Enhances `users` table with full_name, phone, oscar
✅ Creates `vehicle_locations` table for GPS tracking
✅ Creates `flight_tracking` table for flight data
✅ Updates Super Admin profile (Daniel Oriazowan)
✅ Inserts sample data:
   - 3 Programs
   - 6 Papas (Guests)
   - 5 Cheetahs (Vehicles)
   - 3 Airports
   - 3 Hotels
   - 3 Venues

## After Running:

1. **Refresh your app** - Dashboard should now show real data
2. **Test Programs page** - Should show 3 programs
3. **Test Cheetahs page** - Should show 5 vehicles with fuel status
4. **Test Manage Officers** - Super Admin profile should be updated
5. **Test Vehicle Tracking** - Table ready for GPS data
6. **Test Flight Tracking** - Table ready for flight data

## Troubleshooting:

**Error: "relation already exists"**
- This is OK! It means the table was already created
- The migration uses `IF NOT EXISTS` to handle this

**Error: "column already exists"**
- This is OK! It means the column was already added
- The migration uses `IF NOT EXISTS` to handle this

**No data showing in app:**
- Check if data was inserted: Go to Table Editor in Supabase
- Look at `papas`, `cheetahs`, `programs` tables
- If empty, run the INSERT statements again

## Need Help?

Contact: Daniel Oriazowan
Phone: +2348026381777
Email: doriazowan@gmail.com
