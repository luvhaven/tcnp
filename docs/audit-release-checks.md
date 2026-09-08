# Operational release checks

## Live permission verification — 2026-09-08

Run `cbb7c81b` passed all 23 checks against isolated QA accounts in the configured
Supabase project and the local application. Verified positive admin access,
officer/head denial, unit membership boundaries, self-promotion prevention,
notification isolation, inactive login denial, and immediate suspension checks
on all six admin HTTP handlers. All four accounts were disabled and banned at
the end. Earlier diagnostic runs also disabled their accounts.

The live test runner is opt-in (`node scripts/verify-live-roles.cjs
--create-test-accounts --app-url=http://127.0.0.1:3103`) and is deliberately
excluded from ordinary CI. It does not send invitations. It leaves disabled,
labelled QA profiles and their isolated notification records for traceability.

This verifies authorization behaviour; it does not replace the complete
signed-in unit workflow and device checks listed below.

The automated suite covers offline replay rejection, retry retention, account
ownership and authentication expiry. Type checking and the production build are
separate gates; neither proves a successful real-world operational workflow.

## Permission matrix

| Account | Own outbox | Unit records | Manage unit | Other unit management |
| --- | --- | --- | --- | --- |
| Signed out | No | No | No | No |
| Inactive | No replay | No operational authority | No | No |
| Active member | Yes | Per RLS and membership | No | No |
| Active unit head | Yes | Assigned unit, across venues | Assigned unit | No |
| Admin/super admin | Yes | Per platform policies | Yes | Yes |

Test authorization through direct database/API requests as well as navigation.
Existing `can_manage_unit` and `is_unit_member` functions check account activity,
unit activity and membership. A role label in the interface is not authorization.

## End-to-end scenarios requiring signed-in staging accounts

- Save a journey offline, reconnect, confirm one database update and one event.
- Reject an offline insert through RLS, verify the outbox retains it.
- Switch accounts with a pending submission; verify isolation and no replay.
- Assign and reassign A–F posts in two venues; verify the head's overview.
- Sell the last copies concurrently; verify the database stock guard rejects overselling.
- Reconcile book sales with `papa_book_balances` and settlement records.
- Assign a room inspection, fail it, resolve defects and reinspect before check-in.
- Attempt overlapping room stays; verify the database exclusion constraint.
- Assign training to a unit, watch a lesson, submit evaluation and verify reporting.
- Publish an announcement and verify recipient scope and duplicate prevention.
- Compare a known aircraft identity with live telemetry; distinguish scheduled and observed times.

Legacy offline records without an owner are retained in IndexedDB but not replayed
or exposed to a new account. Recovery requires verified ownership. No legacy
records are deleted by this release.
