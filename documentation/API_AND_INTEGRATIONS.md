# API & Integrations

The system leverages a "Backend-as-a-Service" model through Supabase, complemented by internal Next.js API routes for edge cases.

## 🟢 Supabase SDK Integration

We use the `@supabase/supabase-js` client to interact directly with the database from the browser and `@supabase/ssr` for server-side operations.

### Key Integration Points:
-   **Auth:** Handles magic links, email/password login, and session persistence.
-   **Database:** Performs CRUD operations on all tables with RLS enforcement.
-   **Real-time:** Listens for `INSERT`, `UPDATE`, and `DELETE` events on key operational tables.
-   **Storage:** Manages file uploads for Papa profile photos and branding assets.

---

## 🛰 Real-time Data Pipeline

The real-time tracking of Cheetahs (vehicles) follows this flow:

1.  **Field Update:** A Delta Oscar's device (or a dedicated GPS tracker) sends coordinates to the `telemetry_data` table.
2.  **Broadcast:** Supabase Real-time broadcasts this change to all active dashboard subscribers.
3.  **UI Update:** The Map component receives the data and updates the vehicle marker position instantly without a page refresh.

---

## ✉️ Notification Integrations

The system supports a multi-channel notification approach (In-App, Email, SMS).

### 1. In-App Notifications
Managed entirely within the database's `notifications` table and displayed via a "Bell" icon in the dashboard header.

### 2. Email (SMTP)
Configured in the Supabase Dashboard. Used for:
-   Account invites.
-   Daily mission summaries.
-   Security alerts.

### 3. SMS & WhatsApp (Future Expansion)
The database schema is pre-configured to support **Twilio** or **MessageBird** for critical alerts like `Broken Arrow`.

---

## 🧩 Internal API Routes (`/app/api`)

While most logic is handled via the Supabase SDK, we use Next.js API routes for tasks that require the **Supabase Service Role Key** (bypassing RLS):

-   **User Provisioning:** Securely creating user profiles after auth signup.
-   **Bulk Data Export:** Generating CSV/PDF reports on the server to avoid client-side memory limits.
-   **Integration Webhooks:** Reserved for incoming data from external flight tracking services or IoT GPS devices.

---

## 📦 Storage Buckets

| Bucket Name | Access | Use Case |
| :--- | :--- | :--- |
| `avatars` | **Public** | Profile pictures for staff and Papas. |
| `documents` | **Private** | Sensitive Papa data (passports, flight tickets). Restricted by RLS. |
| `logos` | **Public** | Organization branding and system logos. |

---

## 🛠 Integration Best Practices

-   **Client Initialization:** Always use `createClientComponentClient` for client-side hooks and `createLazyServerClient` for Server Components.
-   **Error Handling:** All API calls must be wrapped in `try/catch` and provide user-friendly feedback via **Sonner** toasts.
-   **JWT Refresh:** Handled automatically by the Supabase middleware; developers do not need to manually manage tokens.

---
> [!WARNING]
> Never use the `SUPABASE_SERVICE_ROLE_KEY` on the client side. This key provides full administrative access and should only be used in `.env.local` for server-side Node.js code.
