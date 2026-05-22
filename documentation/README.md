# TCNP Journey Management Documentation

Welcome to the official technical documentation for the **TCNP Journey Management System**. This documentation is designed to provide developers, engineers, and business leaders with a comprehensive understanding of the platform's architecture, workflows, and operational standards.

## 🌟 Project Vision
The TCNP Journey Management System is an enterprise-grade Progressive Web App (PWA) built for **The Covenant Nation Protocol (TCNP)**. Its primary mission is to provide high-fidelity, real-time coordination for guest movements, vehicle tracking, and protocol officer activities through a standardized, call-sign-driven workflow.

In an environment where timing, security, and precision are paramount, this system acts as the central "Command Center," harmonizing 13 distinct roles into a unified operational rhythm.

## 📖 Documentation Roadmap

To get a complete grasp of the system, we recommend exploring the documentation in the following order:

1.  **[Architectural Overview](./ARCHITECTURAL_OVERVIEW.md)**
    *   Deep dive into the Tech Stack (Next.js 15, Supabase, TypeScript, Tailwind).
    *   System design patterns and core principles.
2.  **[Developer Setup Guide](./DEVELOPER_SETUP_GUIDE.md)**
    *   How to go from zero to a running development environment.
    *   Environment variables, local testing, and build processes.
3.  **[Database Design System](./DATABASE_DESIGN_SYSTEM.md)**
    *   Schema definitions, Row Level Security (RLS) policies, and performance indexing.
    *   Data integrity and audit logging mechanisms.
4.  **[RBAC & Permissions Framework](./RBAC_PERMISSIONS_FRAMEWORK.md)**
    *   Analysis of the 13 specialized roles and their granular permission sets.
5.  **[Workflow & Call-Signs](./WORKFLOW_CALL_SIGNS.md)**
    *   The "Language of the System": Understanding First Course, Chapman, Dessert, and Broken Arrow.
6.  **[Frontend Architecture](./FRONTEND_ARCHITECTURE.md)**
    *   Component design (shadcn/ui), state management (Zustand), and PWA implementation.
7.  **[API & Integrations](./API_AND_INTEGRATIONS.md)**
    *   Supabase Real-time, Storage, and external Service Integrations (SMTP, Twilio).
8.  **[DevOps & Maintenance](./DEVOPS_AND_MAINTENANCE.md)**
    *   Deployment strategies, performance optimization, and troubleshooting guides.
9.  **[Glossary of Terms](./GLOSSARY.md)**
    *   Definitions for domain-specific language (Papa, Cheetah, Nest, Theatre, etc.).

---

## 🛠 Core Tech Stack
*   **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion.
*   **Backend:** Supabase (PostgreSQL, Auth, Real-time, Edge Functions).
*   **Maps:** Leaflet & OpenStreetMap for real-time telemetry.
*   **Deployment:** Vercel (Production/Preview).

---

## 🏗 High-Level Architecture
The system follows a **Serverless-First** approach, leveraging Supabase's powerful backend-as-a-service features for real-time capabilities while keeping the frontend highly interactive and responsive through Next.js 15.

> [!IMPORTANT]
> This documentation is a living resource. As the system evolves, ensure all architectural changes, new roles, or modified workflows are reflected here to maintain operational excellence.

---
**Maintained by:** BIGWEB Digital  
**Client:** The Covenant Nation Protocol (TCNP)  
**Version:** 1.0.0
