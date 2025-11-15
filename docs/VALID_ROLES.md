# Valid User Roles Reference

## 📋 Database Enum: `user_role`

These are the ONLY valid values for the `role` column in the `users` table:

### **Core Roles:**
1. `super_admin` - Super Administrator (Full system access)
2. `admin` - Administrator (High-level access)
3. `captain` - Captain (Leadership role)
4. `head_of_command` - Head of Command (Leadership role)

### **Oscar Roles (Field Officers):**
5. `delta_oscar` - Delta Oscar (Field/Journey Officer)
6. `tango_oscar` - Tango Oscar (Transport/Fleet Officer)
7. `head_tango_oscar` - Head Tango Oscar (Lead Transport Officer)
8. `alpha_oscar` - Alpha Oscar (Airport Officer)
9. `november_oscar` - November Oscar (Hotel Officer)
10. `victor_oscar` - Victor Oscar (Venue Officer)

### **Other Roles:**
11. `viewer` - Viewer (Read-only access)
12. `media` - Media (Media team access)
13. `external` - External (External stakeholder access)

---

## ⚠️ Important Notes

### **Roles vs Titles:**

**Roles** (in `users.role` column):
- Basic permission level
- Limited set (13 options above)
- Used for database-level access control

**Titles** (in `official_titles` table):
- Detailed organizational position
- Many options (Echo Oscar, November Oscar Lead, etc.)
- Used for display and fine-grained permissions
- Linked via `users.current_title_id`

### **Common Mistakes:**

❌ **WRONG:**
```sql
role = 'echo_oscar'  -- Does not exist in enum!
role = 'head_of_operations'  -- Does not exist in enum!
```

✅ **CORRECT:**
```sql
-- Use title system for Echo Oscar
EXISTS (
  SELECT 1 FROM official_titles ot
  WHERE ot.id = users.current_title_id
  AND ot.code = 'ECHO_OSCAR'
)

-- Use title system for Head of Operations
EXISTS (
  SELECT 1 FROM official_titles ot
  WHERE ot.id = users.current_title_id
  AND ot.code IN ('HEAD_OF_OPERATIONS', 'HOP')
)
```

---

## 🔧 How to Check Permissions

### **Option 1: Role-Based (Simple)**
```sql
WHERE role IN ('super_admin', 'admin', 'captain')
```

### **Option 2: Title-Based (Detailed)**
```sql
WHERE EXISTS (
  SELECT 1 FROM official_titles ot
  WHERE ot.id = users.current_title_id
  AND ot.code IN ('ECHO_OSCAR', 'ECHO_OSCAR_LEAD')
)
```

### **Option 3: Combined (Recommended)**
```sql
WHERE (
  role IN ('super_admin', 'admin', 'captain')
  OR EXISTS (
    SELECT 1 FROM official_titles ot
    WHERE ot.id = users.current_title_id
    AND ot.code IN ('ECHO_OSCAR', 'ECHO_OSCAR_LEAD')
  )
)
AND is_active = true
```

---

## 📊 Role Hierarchy

```
Super Admin (super_admin)
  └─ Admin (admin)
      ├─ Captain (captain)
      ├─ Head of Command (head_of_command)
      ├─ Head Tango Oscar (head_tango_oscar)
      ├─ Tango Oscar (tango_oscar)
      ├─ Alpha Oscar (alpha_oscar)
      ├─ November Oscar (november_oscar)
      ├─ Victor Oscar (victor_oscar)
      ├─ Delta Oscar (delta_oscar)
      ├─ Viewer (viewer)
      ├─ Media (media)
      └─ External (external)
```

---

## 🎯 Role Assignments by Function

### **Who Can Manage What:**

| Entity | Roles with Access |
|--------|-------------------|
| **Users** | `super_admin`, `admin` |
| **Programs** | `super_admin`, `admin`, `captain`, `head_of_command` + ECHO_OSCAR title |
| **Journeys** | `super_admin`, `admin`, `captain`, `head_of_command` + HOP title |
| **Papas** | `super_admin`, `admin`, `captain`, `head_of_command` |
| **Cheetahs** | `super_admin`, `admin`, `tango_oscar`, `head_tango_oscar` |
| **Theatres** | `super_admin`, `admin`, `victor_oscar` |
| **Nests** | `super_admin`, `admin`, `november_oscar` |
| **Eagle Squares** | `super_admin`, `admin`, `alpha_oscar` |
| **Incidents** | `super_admin`, `admin`, `captain`, `head_of_command` (manage) |
| **Audit Logs** | `super_admin`, `admin`, `captain` (view) |

---

## 🔍 How to Find Your Role

### **In Supabase:**
```sql
SELECT id, email, role, is_active
FROM users
WHERE email = 'your.email@example.com';
```

### **In Application:**
```typescript
const { data: user } = await supabase
  .from('users')
  .select('role, current_title_id, official_titles(name, code)')
  .eq('id', userId)
  .single()

console.log('Role:', user.role)
console.log('Title:', user.official_titles?.name)
```

---

## 🚨 Error Messages

### **"invalid input value for enum user_role"**
**Cause:** Trying to use a role that doesn't exist in the enum.

**Solution:** Use one of the 13 valid roles listed above, OR use the title system.

**Example:**
```sql
-- ❌ WRONG
role = 'echo_oscar'

-- ✅ CORRECT
role = 'admin'
-- OR use title system for Echo Oscar
```

---

## 📝 Adding New Roles (Advanced)

If you need to add a new role to the enum:

```sql
-- Add new role to enum
ALTER TYPE user_role ADD VALUE 'new_role_name';

-- Note: This is permanent and cannot be undone easily
-- Consider using the title system instead for flexibility
```

**⚠️ Warning:** Modifying enums is risky. Use the title system for new positions instead.

---

## ✅ Summary

- **13 valid roles** in the `user_role` enum
- Use **roles** for basic permissions
- Use **titles** for detailed positions
- Combine both for comprehensive access control
- Always check `is_active = true`

---

**For more details, see:**
- `/docs/UNITS_TITLES_GUIDE.md` - Official titles system
- `/docs/DATABASE_SCHEMA.sql` - Complete schema
- `/docs/FIX_ALL_PAGES.sql` - RLS policy examples
