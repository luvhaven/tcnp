# TCNP Architecture — Creation Flows & Data Ownership

**Decision date:** July 2026
**Status:** Adopted

## The rule: registries are owned by units; journeys compose, never create

Every master-data registry has exactly one owning unit, and records are created
**only** in that unit's page by its head (plus platform admins):

| Registry | Owner | Page | Why |
|---|---|---|---|
| Programs | Command / Admin | `/programs` | The umbrella for all operations — everything hangs off a program |
| Papas | Command / Admin | `/papas` | Guest data is sensitive; registered when the invitation is confirmed |
| Cheetahs (vehicles) | Tango Oscar | `/tango` | TO is accountable for vehicular adequacy per SOP TCNP.01.03 |
| Theatres (venues) | Victor Oscar | `/victor` | VO owns venue readiness and seating |
| Eagle Squares (airports) | Alpha Oscar | `/alpha` | AO owns flight ops and airport liaison |
| Nests (hotels) | November Oscar | `/nests` | NO owns reception and accommodation |

**Journeys** (`/journeys`, created by Command/Admin) *compose* these records:
pick a program, a papa, a cheetah, optionally a nest / eagle square / theatre.
The journey form deliberately has **no inline "create venue/vehicle" escape
hatch**.

### Why not inline creation?

1. **Data quality.** Records created mid-journey under time pressure are
   half-filled (no capacity, no coordinates, no driver phone). The owning unit
   fills its registry properly, once.
2. **Accountability matches the SOP.** The SOP names one officer per registry.
   If Command creates a "quick venue" during journey planning, Victor Oscar is
   now responsible for a record they've never seen.
3. **RLS already enforces it.** Database policies grant INSERT on each registry
   to its unit + admins. Inline creation would either fail RLS or require
   widening policies for convenience — the wrong trade.
4. **Guided empty states beat hidden failures.** Instead of a silent empty
   dropdown, the Journeys page shows the **Operational Readiness** panel
   (`components/journeys/OperationalReadiness.tsx`): which registries are
   empty, who owns them, one click to the right page.

### Sequence of operations (happy path)

```
1. Command creates the Program                    (/programs)
2. Command broadcasts a Mission Request           (/programs → Request Availability)
3. Officers confirm availability                  (dashboard prompt)
4. Command assigns available officers             (/programs → Roster)
5. Units ready their registries                   (/tango /victor /alpha /nests)
6. Command registers Papas under the program      (/papas)
7. Command composes Journeys                      (/journeys) ← readiness panel gates this
8. DOs run the journey with call signs            (/my-operations)
9. Command watches live                           (/operations-monitor, /tracking/live)
10. After-op reports close the loop               (/after-op-reports)
```

### Status pipeline (DO → Command)

- Single source of truth: `journeys.status` (journey_status enum, call-sign keys).
- DO updates via `useJourneyStatus` → sets `status`, `status_updated_at`,
  logs `journey_events`, queues offline if disconnected, auto-creates a
  critical incident on `broken_arrow`.
- Ops Monitor (`JourneyStatusTable`) subscribes to `journeys` UPDATE events and
  patches rows in place; journeys leaving the active set (completed, cancelled,
  soft-deleted) are removed instantly.
- Soft-deleted journeys (`is_deleted = true`) are excluded from every
  operational surface — always filter `or('is_deleted.is.null,is_deleted.eq.false')`.

### Media & content ownership (same principle)

| Content | Owner | Page |
|---|---|---|
| Social media assets | Sierra Oscar | `/sierra` |
| Outfits & grooming | Compliance Oscar | `/compliance` |
| Menus / menu of the day | Welfare + NOscar Lounge | `/welfare`, `/nests` |
| Papa accommodations | NOscar Nest | `/nests` (DOs see only their Papa's) |
| Seat arrangements | Head of Victor | `/victor` |
| Places for Papas | Hospitality Oscar | `/hospitality` |
| Financial documents | Leadership only | `/finance` |
| Training schedules | Admin | `/training` |
