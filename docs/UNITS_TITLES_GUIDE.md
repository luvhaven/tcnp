# Protocol Officers Units & Titles System

## 🎯 Overview

The TCNP Journey Management system now includes a comprehensive Units and Official Titles system for managing Protocol Officers across different programs and events.

---

## 📋 Official Titles Structure

### **1. Fixed Leadership Titles** (Cannot be reassigned)
- **Prof** - Professor (Fixed position)
- **Duchess** - Duchess (Fixed position)

### **2. Leadership Titles** (Reassignable)
- **Captain** - Head of all operations (1 position)
- **Vice Captain** - Deputy to Captain (2 positions available)

### **3. Command Titles** (Reassignable)
- **Head of Command** - Head of Command Center (1 position)
- **Head of Operations** - Head of Field Operations (1 position)
- **Command** - Command Center Officer (1 position)

### **4. Oscar Units** (Reassignable, with Team Leads)

Each Oscar unit has regular officers and one Team Lead position:

#### Alpha Oscar (Airport Operations)
- **Alpha Oscar** - Airport Operations Officer
- **Alpha Oscar (Team Lead)** ⭐ - Airport Operations Team Lead

#### Tango Oscar (Transport)
- **Tango Oscar** - Transport Officer
- **Tango Oscar (Team Lead)** ⭐ - Transport Team Lead

#### Victor Oscar (Venue)
- **Victor Oscar** - Venue Officer
- **Victor Oscar (Team Lead)** ⭐ - Venue Team Lead

#### November Oscar (Nest/Hotel)
- **November Oscar** - Nest (Hotel) Officer
- **November Oscar (Team Lead)** ⭐ - Nest Team Lead

#### Echo Oscar (Event Coordination)
- **Echo Oscar** - Event Coordination Officer
- **Echo Oscar (Team Lead)** ⭐ - Event Coordination Team Lead

---

## 🔧 Setup Instructions

### Step 1: Run the Migration

1. **Open Supabase Dashboard** → SQL Editor
2. **Copy all content** from `/docs/MIGRATION_UNITS_TITLES.sql`
3. **Paste and Run**
4. **Verify** you see:
   ```
   Official Titles created | count: 17
   Title Assignments ready | count: 0
   ```

### Step 2: Refresh Your Application

The app will automatically pick up the new tables and functions.

---

## 📱 How to Use

### **Assigning Titles**

1. **Navigate to:** Manage Officers page
2. **Click** on any officer card
3. **Click** the "Title" button
4. **Select** an official title from the dropdown
5. **Click** "Assign Title"

### **Title Assignment Rules**

✅ **Allowed:**
- Assign any non-fixed title to any officer
- Reassign titles between officers (except Prof and Duchess)
- Assign titles for specific programs
- Assign permanent titles (no program specified)
- Have 2 Vice Captains simultaneously
- Have multiple officers in same Oscar unit (but only 1 Team Lead per unit)

❌ **Not Allowed:**
- Reassign Prof or Duchess titles
- Exceed maximum positions for a title
- Assign same title twice to same person in same program

### **Reassigning Titles**

To reassign a title from one officer to another:

1. **Go to** Manage Officers
2. **Click** "Title" on the new officer
3. **Select** the title you want to reassign
4. System automatically deactivates old assignment
5. New officer gets the title

**Note:** Fixed titles (Prof, Duchess) cannot be reassigned.

---

## 🗄️ Database Structure

### **Tables Created**

#### `official_titles`
Stores all available official titles.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| code | TEXT | Unique code (e.g., 'CAPTAIN', 'ALPHA_OSCAR') |
| name | TEXT | Display name |
| unit | TEXT | 'leadership', 'command', or 'oscar' |
| is_fixed | BOOLEAN | True for Prof and Duchess |
| is_team_lead | BOOLEAN | True for Oscar team leads |
| max_positions | INTEGER | Maximum simultaneous assignments |

#### `title_assignments`
Tracks who has which title and when.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Protocol Officer |
| title_id | UUID | Official title |
| program_id | UUID | Specific program (NULL = permanent) |
| assigned_by | UUID | Who assigned it |
| assigned_at | TIMESTAMP | When assigned |
| is_active | BOOLEAN | Currently active |

#### `users` (Enhanced)
Added columns:

| Column | Type | Description |
|--------|------|-------------|
| current_title_id | UUID | Current permanent title |
| unit | TEXT | Current unit assignment |

---

## 🔍 SQL Functions

### **assign_title()**

Assigns a title to a Protocol Officer.

```sql
SELECT assign_title(
  p_user_id := 'user-uuid-here',
  p_title_code := 'CAPTAIN',
  p_program_id := NULL,  -- NULL for permanent, or program UUID
  p_assigned_by := 'admin-uuid-here'
);
```

**Features:**
- Validates title exists
- Checks if title is fixed and already assigned
- Enforces max positions limit
- Deactivates previous assignments
- Updates user's current title

### **reassign_title()**

Reassigns a title from one officer to another.

```sql
SELECT reassign_title(
  p_from_user_id := 'old-user-uuid',
  p_to_user_id := 'new-user-uuid',
  p_title_code := 'CAPTAIN',
  p_program_id := NULL,
  p_assigned_by := 'admin-uuid-here'
);
```

**Features:**
- Validates title is not fixed
- Deactivates old assignment
- Creates new assignment
- Returns assignment ID

---

## 📊 Views

### **current_title_assignments**

Shows all active title assignments with full details.

```sql
SELECT * FROM current_title_assignments;
```

**Columns:**
- user_id, full_name, email
- title_id, title_code, title_name
- unit, is_fixed, is_team_lead
- program_id, program_name
- assigned_by, assigned_by_name
- assigned_at

---

## 🎭 Use Cases

### **Scenario 1: Permanent Title Assignment**

Assign Captain title permanently to John Doe:

```sql
SELECT assign_title(
  p_user_id := 'john-uuid',
  p_title_code := 'CAPTAIN',
  p_program_id := NULL,
  p_assigned_by := 'admin-uuid'
);
```

### **Scenario 2: Program-Specific Title**

Assign Alpha Oscar Team Lead for Presidential Visit program:

```sql
SELECT assign_title(
  p_user_id := 'jane-uuid',
  p_title_code := 'ALPHA_OSCAR_LEAD',
  p_program_id := 'presidential-visit-uuid',
  p_assigned_by := 'admin-uuid'
);
```

### **Scenario 3: Reassign Title**

Reassign Head of Command from Alice to Bob:

```sql
SELECT reassign_title(
  p_from_user_id := 'alice-uuid',
  p_to_user_id := 'bob-uuid',
  p_title_code := 'HEAD_OF_COMMAND',
  p_program_id := NULL,
  p_assigned_by := 'admin-uuid'
);
```

---

## 🔐 Permissions

### **Who Can Assign Titles?**

- ✅ Super Admin
- ✅ Admin
- ✅ Captain
- ❌ Other roles

### **Row Level Security (RLS)**

All tables have RLS enabled:

- **View:** All authenticated users
- **Manage:** Super Admin, Admin, Captain only

---

## 📈 Reporting

### **Get All Officers by Unit**

```sql
SELECT 
  u.full_name,
  u.unit,
  ot.name as title
FROM users u
LEFT JOIN official_titles ot ON u.current_title_id = ot.id
WHERE u.unit = 'oscar'
ORDER BY u.full_name;
```

### **Get Team Leads**

```sql
SELECT 
  u.full_name,
  ot.name as title,
  ot.unit
FROM users u
JOIN official_titles ot ON u.current_title_id = ot.id
WHERE ot.is_team_lead = true;
```

### **Get Officers Without Titles**

```sql
SELECT 
  full_name,
  email,
  role
FROM users
WHERE current_title_id IS NULL
  AND is_active = true;
```

---

## 🎯 Best Practices

### **1. Title Assignment Strategy**

- Assign permanent titles for core team members
- Use program-specific titles for event-based assignments
- Always assign Team Leads for Oscar units
- Keep Prof and Duchess assignments permanent

### **2. Program Management**

- Create programs before assigning program-specific titles
- Review title assignments when program ends
- Archive old assignments for historical records

### **3. Team Organization**

- Each Oscar unit should have a Team Lead
- Distribute officers across units based on expertise
- Maintain balance between units

---

## 🐛 Troubleshooting

### **Error: "Title is fixed and already assigned"**

**Cause:** Trying to assign Prof or Duchess when already assigned.

**Solution:** These titles are fixed. Contact Super Admin to reassign if needed via database.

### **Error: "Maximum positions reached"**

**Cause:** Trying to assign more than allowed positions (e.g., 3rd Vice Captain).

**Solution:** Reassign existing title holder or wait for position to open.

### **Title not showing in dropdown**

**Cause:** Migration not run or table not created.

**Solution:** Run `/docs/MIGRATION_UNITS_TITLES.sql` in Supabase SQL Editor.

---

## 📞 Support

For issues or questions about the Units & Titles system:

- **Super Admin:** Daniel Oriazowan
- **Email:** doriazowan@gmail.com
- **Phone:** +2348026381777

---

## ✅ Summary

### **What's New:**

✅ 17 official titles across 3 units
✅ Fixed titles (Prof, Duchess)
✅ Team Lead positions for Oscar units
✅ Program-specific title assignments
✅ Title reassignment functionality
✅ Comprehensive tracking and reporting

### **Key Benefits:**

- Clear organizational structure
- Flexible title management
- Program-based assignments
- Historical tracking
- Role-based permissions

**The Units & Titles system is now fully operational!** 🎉
