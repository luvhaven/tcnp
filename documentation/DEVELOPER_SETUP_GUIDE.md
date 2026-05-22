# Developer Setup Guide

This guide describes the process of setting up the TCNP Journey Management System for local development and testing.

## 📋 Prerequisites

Ensure you have the following installed on your machine:
-   **Node.js:** version 18.17.0 or higher.
-   **NPM:** version 9.x or higher.
-   **Git:** for version control.
-   **Supabase CLI (Optional):** Recommended for local database development.
-   **Vercel CLI (Optional):** Recommended for deployment testing.

---

## 🚀 Step-by-Step Initialization

### 1. Repository Setup
First, clone the repository and navigate into the project directory:
```bash
git clone <repository-url>
cd tcnp
```

### 2. Dependency Installation
Install the necessary packages using npm:
```bash
npm install
```
> [!NOTE]
> If you encounter peer dependency errors, use `npm install --legacy-peer-deps`.

### 3. Environment Configuration
The application requires several environment variables to communicate with Supabase. Create a `.env.local` file in the root directory by copying the example:
```bash
cp .env.local.example .env.local
```

Fill in the following variables:
-   `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
-   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key.
-   `SUPABASE_SERVICE_ROLE_KEY`: Service role key (Keep this secure; only used server-side).
-   `NEXT_PUBLIC_APP_URL`: Set to `http://localhost:3000` for local dev.

### 4. Database Provisioning
The system depends on a specific PostgreSQL schema. Follow these steps in the [Supabase Dashboard](https://supabase.com):
1.  **Run SQL Schema:** Copy the contents of `docs/DATABASE_SCHEMA.sql` into the Supabase SQL Editor and run it.
2.  **Seed Data:** Run `docs/SEED_DATA.sql` to populate the system with base roles, sample Papas, and vehicles.
3.  **Real-time Replication:**
    - Go to **Database > Replication**.
    - Click **Source: publication [supabase_realtime]**.
    - Enable replication for the following tables: `journeys`, `journey_events`, `cheetahs`, `telemetry_data`, `users`, `notifications`.
4.  **Storage Buckets:** Create the following buckets in **Storage**:
    - `avatars` (Public)
    - `documents` (Private)
    - `logos` (Public)

### 5. Authentication Setup
To log in for the first time:
1.  Go to **Authentication > Users** in the Supabase Dashboard.
2.  Click **Add User > Create New User**.
3.  Assign an email and password.
4.  Once created, the database trigger will automatically create a corresponding profile in the `users` table with the role `super_admin` (based on the trigger logic or manual assignment).

### 6. Local Development Server
Launch the development server:
```bash
npm run dev
```
Navigate to `http://localhost:3000` to view the application.

---

## 🛠 Available Scripts

-   `npm run dev`: Runs the app in development mode with HMR.
-   `npm run build`: Generates an optimized production build.
-   `npm run start`: Starts the production server.
-   `npm run lint`: Runs ESLint to check for code quality issues.
-   `npm run type-check`: Validates TypeScript types across the project.

---

## 🧪 Testing and Quality Assurance

### Type Safety
The system uses strict TypeScript. It is recommended to keep your IDE's TS Server running and resolve any red squiggly lines before committing code.
```bash
npm run type-check
```

### Linting
We follow Next.js and React best practices.
```bash
npm run lint
```

---

## 🐛 Troubleshooting Common Issues

| Issue | Potential Cause | Solution |
| :--- | :--- | :--- |
| **Login fails** | RLS Policy or Missing User | Ensure the user exists in `auth.users` AND has a record in `public.users`. |
| **Real-time not updating** | Replication Disabled | Verify replication is enabled for the specific table in Supabase. |
| **Map is blank** | Missing CSS or API Key | Check if Leaflet styles are imported in `layout.tsx`. |
| **Module not found** | Missing installation | Run `npm install` again to ensure all dependencies are resolved. |

---
> [!IMPORTANT]
> Never commit your `.env.local` file to version control. It contains sensitive keys that could compromise the system's security.
