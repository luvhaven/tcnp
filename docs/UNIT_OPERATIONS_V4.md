# TCNP Unit Operations v4

## Product architecture

Version 4 separates four concepts that were previously mixed together:

1. **Platform authority** — Super Admin, Admin and operational leadership.
2. **Permanent unit membership** — stored in `units` and `unit_memberships`.
3. **Programme deployment** — the unit, venue and shift a person is supervising.
4. **Temporary duty** — journey DO, vehicle, inspection, post or prayer-slot assignments.

The permission order for new workspaces is:

`Super Admin > Admin > Head of Unit > Unit Member > Assigned Contributor`

Heads can manage only their own workspace. Admins can manage operational data
across units. Only Super Admin retains the highest security authority. Existing
`users.role` and `users.oscar` values remain for compatibility while the new
membership model is adopted.

## Delivered workspaces

### Victor

- Programme-to-many-venue supervision and unit deployments.
- Priority positions A–F with officer assignment and reassignment.
- Papa- or time-specific welcome parties.
- Reusable Senior Minister directory and programme accreditation.
- Named associates, PAs, family and entourage.
- Microphone, slides, clicker and detailed stage-prop briefings.
- Private presentation uploads and signed downloads.
- Book batches, immutable sales/return movements, remaining stock and 100% payout.
- Published/versioned seat-plan foundation with normalized seat assignments.

### Tango

- Internal/external fleet partners.
- Multiple Cheetahs on one journey while retaining the legacy primary vehicle.
- Call-sign and driver allocation visibility.
- Assigned-DO driver feedback with Tango-head review.
- Papa flight itineraries and multi-leg visibility.

### Command and Alpha

- One flight-leg model keyed to a scheduled occurrence, not a recurring callsign.
- OpenSky live telemetry with scheduled/unavailable fallback and explicit confidence.
- Shared Papa flight monitor for Command.
- Legacy Papa flight fields are backfilled into one itinerary leg.

Free ADS-B coverage cannot guarantee worldwide FlightRadar-grade coverage. The UI
must label a state as live only when telemetry for the exact leg is matched.

### November Nest

- Rooms, stays, shared occupants, planned/actual check-in and check-out.
- Assigned room inspection, confirmation and reinspection states.
- Gifts/amenities with private room photographs.
- Defect ownership, severity, resolution history and next-use blocking.
- Papa arrival, flight, dietary and entourage briefing visibility.

### Training

- Calendar-ready sessions with audience visibility.
- YouTube Privacy Enhanced Mode courses and lessons.
- Per-officer assignment, server-verified watch progress and 90% completion.
- Event attendance and check-in.
- New/existing member evaluations with reviewer feedback.
- Unit-specific and Training-only content.
- Unit membership management and atomic, audience-scoped schedule broadcasts.
- Existing SOP and Code of Conduct documents remain supported.

An unlisted YouTube video is members-only inside TCNP, but its URL can still be
shared. Truly private YouTube videos require Google-account access outside TCNP.

### Compliance

- Year-end party, team-bonding and awards projects.
- Owners, dates, priority, status and task tracking.
- Award-category and nominee foundation.
- Existing outfit and grooming standards remain unchanged.

### Welfare

- Event, WOFBEC, training, daily-member and hourly prayer chains.
- Slot groups and individual assignments.
- Visits, charity, member-support and welfare-emergency cases.
- Birthday and wedding celebrations.
- Daily 07:00 Africa/Lagos Head-of-Welfare birthday notification plus first-open fallback.
- Emergency-contact collection and UI exposure removed non-destructively.

## Safe deployment order

1. Rotate the exposed historical Supabase service-role key.
2. Back up the production database and inspect current RLS/storage policies.
3. Apply migrations in timestamp order:
   - `20260901090000_unit_operations_foundation.sql`
   - `20260901091000_guest_transport_accommodation_operations.sql`
   - `20260901092000_people_development_compliance_welfare.sql`
   - `20260901093000_access_privacy_hardening.sql`
4. Configure `CRON_SECRET` in the hosting environment.
5. Deploy the v4 application.
6. Verify Super Admin, Admin, each Head of Unit, a unit member, a DO and a pending account.
7. Validate private presentation/room-media signed URLs and the 07:00 cron result.

Both cron routes intentionally return `503` when `CRON_SECRET` is absent and
`401` for an invalid bearer token. Do not weaken this fail-closed behaviour in
development or production.

The release intentionally keeps legacy columns and singular assignments for
rollback. Remove them only after production backfill and a separate retention
decision.
