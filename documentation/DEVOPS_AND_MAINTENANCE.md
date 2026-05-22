# DevOps & Maintenance

This document covers the deployment pipeline, performance optimization strategies, and standard maintenance procedures for the TCNP Journey Management System.

## 🚀 Deployment Pipeline

The application is optimized for deployment on **Vercel**.

### Production Branch (`main`)
Every push to the `main` branch triggers an automatic production build and deployment via Vercel's CI/CD pipeline.
1.  **Code Check:** ESLint and TypeScript validation.
2.  **Build:** Next.js production optimization (tree-shaking, image optimization).
3.  **Deploy:** Atomic deployment to Vercel's global CDN.

### Preview Branches
Every Pull Request creates a unique preview URL, allowing stakeholders to test features in a live environment before merging into production.

---

## ⚡ Performance Optimization

To maintain a high-speed experience under load, keep the following strategies in mind:

### 1. Data Pagination
Large tables (Audit Logs, Journeys, Users) **must use server-side pagination**.
-   Avoid `select('*')` on large datasets.
-   Implement the `usePagination` hook to load data in chunks of 50.

### 2. Asset Optimization
-   **Images:** Always use the Next.js `<Image />` component to serve WebP/AVIF formats and optimized sizes.
-   **Maps:** Use dynamic imports for Leaflet components to avoid including them in the initial JS bundle.

### 3. Database Maintenance
-   **VACUUM:** Periodically run maintenance on the PostgreSQL database to reclaim storage and update statistics.
-   **Index Monitoring:** Use the `explain analyze` command in the SQL Editor to identify and fix slow-performing queries.

---

## 🧹 Maintenance Procedures

### User Cleanup
On a quarterly basis, administrators should review the `users` table and deactivate accounts that are no longer in active duty for the protocol.

### Log Rotation
The `audit_logs` and `journey_events` tables can grow rapidly during major missions.
-   Archiving old data (older than 1 year) to a separate storage bucket is recommended to keep the primary database light.

### Environment Variable Audit
Ensure all keys (Supabase, Twilio, SMTP) are rotated annually or whenever a lead developer leaves the project.

---

## 🛑 Troubleshooting Guide

| Symptom | Investigation Step | Resolution |
| :--- | :--- | :--- |
| **App is slow to respond** | Check Supabase DB usage in Cloud Dashboard. | Optimization: Add missing indexes or fix RLS loops. |
| **Notifications not arriving** | Check `notifications` table status column. | Ensure SMTP/Twilio credentials are still valid. |
| **Schema out of sync** | Compare `database.types.ts` with local db. | Run `supabase gen types` to update TypeScript definitions. |
| **Real-time lag** | Check browser websocket connection (Network tab). | Ensure replication is still enabled for the specific table. |

---

## 📊 Monitoring

We recommend using the following tools for production monitoring:
-   **Vercel Analytics:** For tracking Web Vitals (LCP, FID, CLS).
-   **Sentry:** For error tracking and crash reporting.
-   **Supabase Advisors:** For database security and performance recommendations.

---
> [!IMPORTANT]
> **Backup Policy:** Supabase provides automatic daily backups. For critical missions, it is recommended to perform manual SQL exports of the `papas` and `journeys` tables before and after the event.
