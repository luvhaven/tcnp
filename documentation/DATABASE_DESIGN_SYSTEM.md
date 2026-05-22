# Database Design System

The TCNP Journey Management System is powered by a robust PostgreSQL database hosted on Supabase. This document details the schema design, security model (RLS), and integrity constraints.

## 🗃 Entity-Relationship Summary

The database is designed around several core entities that represent the real-world protocol operations:

### Core Entities
-   **Users & Roles:** Authentication and Authorization.
-   **Papas:** High-Profile Guests (Principals).
-   **Cheetahs:** Vehicles in the fleet.
-   **Journeys:** The primary operational unit connecting a Papa, a Cheetah, and a Destination.
-   **Eagle Squares (Airports), Nests (Hotels), & Theatres (Venues):** Geographic operational hubs.

### Event & Monitoring Entities
-   **Journey Events:** Immutable trail of call-signals (SOP actions).
-   **Telemetry Data:** Real-time location history for vehicles.
-   **Incidents:** Tracking of emergencies (Broken Arrow) and operational hurdles.
-   **Audit Logs:** System-wide tracking of user actions for accountability.

---

## 🛡 Security: Row Level Security (RLS)

Security is enforced at the database level using PostgreSQL RLS policies. This ensures that even if the application layer is compromised, data access is restricted based on the user's role.

### Key RLS Principles:
1.  **Isolation:** Users can always view and update their own profiles.
2.  **Role-Based Filters:** Administrative roles (Super Admin, Captain) have broad access; operational roles (DO, TO, AO) are restricted to their specific domains.
3.  **Assignment Locks:** Delta Oscars can only update journeys to which they are explicitly assigned.
4.  **Audit Integrity:** Audit logs can only be inserted by the system and viewed by high-level administrators.

### RLS Helper Functions:
We use specialized SQL functions to simplify policy definitions:
-   `get_user_role()`: Retrieves the current requester's role.
-   `has_role(required_role)`: Boolean check for a specific role.
-   `has_any_role(required_roles[])`: Boolean check for any role in a provided list.

---

## ⚡ Performance Optimization

To handle real-time telemetry and high-frequency updates, the following optimizations are implemented:

### Indexing Strategy
-   **Foreign Keys:** All `_id` columns are indexed to speed up joins.
-   **Status & Roles:** Columns like `journeys.status` and `users.role` are indexed for fast filtering.
-   **Temporal Data:** `audit_logs.created_at` and `telemetry_data.timestamp` are indexed in descending order for rapid retrieval of latest events.
-   **Partial Indexes:** Performance is improved using partial indexes on active records (e.g., `idx_users_is_active`).

### Real-time Replication
Tables participating in the live tracking experience have **Replication** enabled in Supabase, allowing the frontend to subscribe to changes via WebSockets instead of polling.

---

## 🔄 Business Logic: Triggers & Functions

Complex business rules are handled via database triggers to ensure consistency across all clients:

-   **`update_updated_at_column()`**: Ensures every record has an accurate `updated_at` timestamp.
-   **Audit Triggers:** Automatically captures state changes in `journeys` and `users` into the `audit_logs` table.
-   **Notification Triggers:** Inserts record into `notifications` when critical events (like `Broken Arrow`) occur.

---

## 📊 Data Dictionary (High-Level)

| Table | Purpose | Primary Key | Key Relations |
| :--- | :--- | :--- | :--- |
| `users` | Protocol staff profiles | `id (UUID)` | `auth.users` |
| `papas` | Guest information | `id (UUID)` | `users (created_by)` |
| `cheetahs` | Vehicle fleet | `id (UUID)` | - |
| `journeys` | Live operations | `id (UUID)` | `papas`, `cheetahs`, `users` |
| `incidents` | Incident management | `id (UUID)` | `journeys`, `users` |
| `telemetry_data` | Live GPS tracking | `id (UUID)` | `journeys`, `cheetahs` |

---
> [!IMPORTANT]
> When performing migrations, never hardcode UUIDs. Always use the provided helper functions or look up IDs dynamically to maintain environment portability.
