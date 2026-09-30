# Role Acceptance Test Matrix

Status: 26 approved test profiles are active. API role checks are complete; representative UI and responsive checks are recorded below.

This matrix uses the role values currently offered by the Officers page, with the legacy November Oscar role retained as a compatibility check. Super Admin is excluded: the platform owner remains the only account with that authority. Admin can be added as a separate privileged test persona if explicitly requested.

## Test profile emails

All 26 accounts are approved and active. No invitation emails were sent; they use the owner-provided Gmail plus-addresses.

| Role | Email |
| --- | --- |
| `captain` | `doriazowan+codex-qa-captain@gmail.com` |
| `vice_captain` | `doriazowan+codex-qa-vice-captain@gmail.com` |
| `head_of_operations` | `doriazowan+codex-qa-head-of-operations@gmail.com` |
| `head_of_command` | `doriazowan+codex-qa-head-of-command@gmail.com` |
| `command` | `doriazowan+codex-qa-command@gmail.com` |
| `alpha_oscar` | `doriazowan+codex-qa-alpha-oscar@gmail.com` |
| `head_alpha_oscar` | `doriazowan+codex-qa-head-alpha-oscar@gmail.com` |
| `tango_oscar` | `doriazowan+codex-qa-tango-oscar@gmail.com` |
| `head_tango_oscar` | `doriazowan+codex-qa-head-tango-oscar@gmail.com` |
| `noscar_den` | `doriazowan+codex-qa-noscar-den@gmail.com` |
| `head_noscar_den` | `doriazowan+codex-qa-head-noscar-den@gmail.com` |
| `noscar_nest` | `doriazowan+codex-qa-noscar-nest@gmail.com` |
| `head_noscar_nest` | `doriazowan+codex-qa-head-noscar-nest@gmail.com` |
| `november_oscar` | `doriazowan+codex-qa-november-oscar@gmail.com` |
| `victor_oscar` | `doriazowan+codex-qa-victor-oscar@gmail.com` |
| `head_victor_oscar` | `doriazowan+codex-qa-head-victor-oscar@gmail.com` |
| `delta_oscar` | `doriazowan+codex-qa-delta-oscar@gmail.com` |
| `serial_oscar` | `doriazowan+codex-qa-serial-oscar@gmail.com` |
| `head_serial_oscar` | `doriazowan+codex-qa-head-serial-oscar@gmail.com` |
| `compliance_oscar` | `doriazowan+codex-qa-compliance-oscar@gmail.com` |
| `head_compliance_oscar` | `doriazowan+codex-qa-head-compliance-oscar@gmail.com` |
| `welfare_oscar` | `doriazowan+codex-qa-welfare-oscar@gmail.com` |
| `head_welfare_oscar` | `doriazowan+codex-qa-head-welfare-oscar@gmail.com` |
| `echo_oscar` | `doriazowan+codex-qa-echo-oscar@gmail.com` |
| `head_echo_oscar` | `doriazowan+codex-qa-head-echo-oscar@gmail.com` |
| `viewer` | `doriazowan+codex-qa-viewer@gmail.com` |

## Proposed personas

| Group | Role value | Persona | Setup status | Result |
| --- | --- | --- | --- | --- |
| Leadership | `captain` | Captain | Active | API smoke passed |
| Leadership | `vice_captain` | Vice Captain | Active | API smoke passed |
| Command | `head_of_operations` | Head of Operations | Active | API smoke passed |
| Command | `head_of_command` | Head of Command | Active | API smoke passed |
| Command | `command` | Command | Active | API smoke passed |
| Alpha Oscar | `alpha_oscar` | Alpha Oscar | Active | API smoke passed |
| Alpha Oscar | `head_alpha_oscar` | Head, Alpha Oscar | Active | API smoke passed |
| Tango Oscar | `tango_oscar` | Tango Oscar | Active | API smoke passed |
| Tango Oscar | `head_tango_oscar` | Head, Tango Oscar | Active | API smoke passed |
| November (Den) | `noscar_den` | November (Den) | Active | API smoke passed |
| November (Den) | `head_noscar_den` | Head, November (Den) | Active | API smoke passed |
| November (Nest) | `noscar_nest` | November (Nest) | Active | API smoke passed |
| November (Nest) | `head_noscar_nest` | Head, November (Nest) | Active | API smoke passed |
| November (legacy) | `november_oscar` | November Oscar (Legacy) | Active | API smoke passed |
| Victor Oscar | `victor_oscar` | Victor Oscar | Active | API smoke passed |
| Victor Oscar | `head_victor_oscar` | Head, Victor Oscar | Active | API smoke passed |
| Delta Oscar | `delta_oscar` | Delta Oscar | Active | API smoke passed |
| Serial Oscar | `serial_oscar` | Serial Oscar | Active | API smoke passed |
| Serial Oscar | `head_serial_oscar` | Head, Serial Oscar | Active | API smoke passed |
| Compliance Oscar | `compliance_oscar` | Compliance Oscar | Active | API smoke passed |
| Compliance Oscar | `head_compliance_oscar` | Head, Compliance Oscar | Active | API smoke passed |
| Welfare Oscar | `welfare_oscar` | Welfare Oscar | Active | API smoke passed |
| Welfare Oscar | `head_welfare_oscar` | Head, Welfare Oscar | Active | API smoke passed |
| Echo (legacy) | `echo_oscar` | Echo Oscar | Active | API smoke passed |
| Echo (legacy) | `head_echo_oscar` | Head, Echo Oscar | Active | API smoke passed |
| Viewer | `viewer` | Viewer baseline | Active | API smoke passed |

Delta Oscar currently has no separate head role in the Officers page role list. Echo is marked legacy in the Officers page, but included to check compatibility. Super Admin is excluded; an Admin persona is also excluded unless explicitly requested because it grants platform-wide user administration.

## Pre-test security fix

Public self-registration now ignores any submitted role and always creates an inactive, pending Viewer request. An authorized administrator must assign a unit or head role before activation. The regression test for this rule passes.

## Checks per persona

- Authenticate as the approved account; verify activation and role/unit. API session validation is recorded above.
- Check that navigation exposes the pages expected for that role and omits restricted pages.
- Exercise that role's normal unit workflow, including save, edit, validation, empty, loading, and error states.
- Verify the role cannot read or change another unit's private data or perform another unit's management actions.
- Verify head roles can perform their documented team-management actions without receiving platform administrator or Super Admin authority.
- Check keyboard navigation, accessible names, focus visibility, and mobile reflow at 320, 390, 768, 1024, and 1440 CSS pixels.
- Record concrete defects with route, role, steps, expected result, actual result, severity, and a regression check.


## Test results and fixes

- **26/26 approved roles:** A passwordless test session was issued without sending mail. `/api/auth/check-activation` returned 200 and `/api/officers/{self}/details` returned 200 for every persona.
- **Authorization boundary:** `/api/officers/list` returned 403 for all 26 unit/leadership/viewer profiles; unauthenticated access returned 401. Distinct cross-profile requests returned 403 for unit members and Viewer, and 200 only for the five command/captain leadership roles plus Head of Welfare, matching `canViewOfficerFullProfile`.
- **Browser role smoke:** Alpha Oscar workspace loaded; an Alpha role received the expected “Command Clearance Required” state on the Command route. Data-creating buttons were not submitted.
- **Responsive review:** Alpha workspace checked at 320, 390, 768, 1024, and 1440 CSS pixels. At 320px, “Airport Management” overlapped its action button and the first tab label was clipped. Fixed by stacking the header on narrow screens and allowing the tab label to wrap. Rechecked at 320px; the heading, full-width action, and both tab labels now fit.
- **Production and device scope:** Production build and unauthenticated login page smoke passed. Responsive screenshots were taken in browser emulation, not on physical iOS/Android devices. Other unit pages, operational mutations, push notifications, and the owner self-removal workflow were not exercised against production data to avoid changing real records or removing the owner profile.
## Release checks

- `npm test`: 36/36 passed.
- `npm run type-check`: passed.
- `npm run lint`: 0 errors; 36 existing warnings remain.
- `npm run build`: passed; all 62 app pages/routes compiled.
- Production-mode local login smoke: passed; no browser console errors in a fresh tab.
- `git diff --check`: passed.

**Readiness assessment:** Build- and authentication-ready for a controlled canary, but not fully production-certified. This pass did not cover all operational write workflows, all unit pages in an authenticated browser, live notification delivery, or physical iOS/Android devices. Lint warnings also remain. Review those limits before treating the app as fully production-ready.

## Outcome log

| Date | Role/persona | Route and scenario | Expected | Actual | Status / fix |
| --- | --- | --- | --- | --- | --- |
| 2026-09-30 | Public signup | Submit a client-supplied privileged role to `/api/auth/signup` | Request remains pending Viewer until an administrator assigns a role | Signup now hard-codes `viewer`; regression test passes | Fixed and verified by regression test |
| — | — | — | — | — | Commit `c230f9b` was pushed to GitHub `main` on 2026-09-30. |
