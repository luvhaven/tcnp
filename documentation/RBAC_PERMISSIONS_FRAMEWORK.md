# RBAC & Permissions Framework

The TCNP Journey Management System utilizes a sophisticated Role-Based Access Control (RBAC) system to manage 14 distinct user roles. This ensures that every member of the protocol team has exactly the access they need to perform their duties.

## 👥 Administrative Roles

These roles focus on system oversight, user management, and high-level operational reporting.

| Role | Responsibility | Key Permissions |
| :--- | :--- | :--- |
| **Super Admin** | Full system owner. | Manage all users, roles, system settings, and audit logs. |
| **Admin** | General administrator. | Manage users, Papas, and fleet entities. |
| **Captain / Head of Operation** | Operational Lead. | Oversee all active journeys and manage protocol officer assignments. |
| **Head of Command Center** | Monitoring Lead. | Real-time global tracking and command center dashboard access. |

---

## 🏃 Operational Roles (The "Oscars")

These roles represent the "boots on the ground" and are responsible for executing specific segments of the protocol mission.

### 🎖 Delta Oscar (DO)
The DO is the primary handler for a Papa (Principal).
-   **Core Task:** Executes call-signs during a journey and ensures principal safety.
-   **Permissions:** Update assigned journeys, report incidents, view Papa bios.

### 🎖 Tango Oscar (TO)
The TO manages the "Cheetahs" (Fleet).
-   **Core Task:** Vehicle maintenance, driver assignments, and fuel monitoring.
-   **Permissions:** Manage cheetah status, assign vehicles to journeys.

### 🎖 Alpha Oscar (AO)
The AO manages "Eagle Squares" (Airports).
-   **Core Task:** Monitoring flight arrivals and departures (ETAs/ETDs).
-   **Permissions:** Update airport-specific travel data for Papas.

### 🎖 November Oscar (NO)
The NO manages "Nests" (Hotels).
-   **Core Task:** Coordination of room assignments, check-in/out procedures, and Theatre entertainment coordination.
-   **Permissions:** View journey schedules and manage hotel/entertainment manifest.

### 🎖 Victor Oscar (VO)
The VO manages "Theatres" (Venues).
-   **Core Task:** Managing gate access and arrival confirmations at events.
-   **Permissions:** Update theatre status and arrival timestamps.

### 🎖 Echo Oscar (EO)
The EO manages the "Equipment" at the Theatre.
-   **Core Task:** Ensuring all technical equipment at the venue is operational during missions.
-   **Permissions:** Manage equipment inventory and status logs.

---

## 👁 Limited & External Roles

| Role | Responsibility | Access Level |
| :--- | :--- | :--- |
| **Viewer** | General staff. | Read-only access to journeys and dashboard stats. |
| **Media / Mike Uniform** | Press coordination. | Can only view arrival times and limited itinerary data. |
| **External** | Third-party partners. | Restricted view of specific public-facing mission data. |

---

## 🔐 The Permission Logic

Permissions are stored as a JSONB array in the `roles` table. This allows for future flexibility if new permission nodes are added.

### How it works in the Code:
1.  **Database Level:** RLS policies check the `users.role` column.
2.  **API Level:** Middleware verifies the JWT claims and the user's role.
3.  **UI Level:** Custom hooks like `usePermissions()` show or hide UI elements (buttons, pages) based on the user's active role.

```typescript
// Example frontend check
const { canExecuteCallSign } = usePermissions();

{canExecuteCallSign && (
  <Button onClick={handleCallSign}>Execute First Course</Button>
)}
```

---

## 📝 Managed Deactivation
To maintain security without losing historical data:
-   Users are **never deleted**.
-   Instead, the `is_active` flag is set to `false`, immediately revoking all access via RLS.
-   Only Super Admins can deactivate/reactivate accounts.

---
> [!IMPORTANT]
> The Role "Super Admin" is hardcoded in some triggers to prevent accidental lockout. Avoid renaming this role in the database.
