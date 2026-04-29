# docs/archive — Historical Migration & Fix Scripts

This folder contains SQL migration and fix scripts that were used during development of the TCNP Journey Management system.

## What's in here

These files were generated iteratively as the application was built and debugged. They represent the history of the development process — schema refinements, RLS policy corrections, enum casting fixes, and feature additions.

**They are NOT the authoritative schema.** Do not run these blindly on a fresh database.

## Canonical Files (use these instead)

| Purpose | File |
|---------|------|
| Full database schema | [`../DATABASE_SCHEMA.sql`](../DATABASE_SCHEMA.sql) |
| Sample seed data | [`../SEED_DATA.sql`](../SEED_DATA.sql) |
| RBAC permissions | [`../RBAC_PERMISSIONS_SYSTEM.sql`](../RBAC_PERMISSIONS_SYSTEM.sql) |
| Supabase setup guide | [`../SUPABASE_SETUP.md`](../SUPABASE_SETUP.md) |

## When would you use these?

- You're debugging a specific RLS issue and want to see how it was solved historically
- You're trying to understand why a particular column or enum was changed
- You're doing a database audit and want to trace schema evolution

## Naming Convention

- `FIX_*.sql` — One-off fixes for specific bugs
- `MIGRATION_*.sql` — Schema additions or changes applied to production
- `ADD_*.sql` — New features added to existing schema
- `SEED_*.sql` — Specific seed data scripts for testing
