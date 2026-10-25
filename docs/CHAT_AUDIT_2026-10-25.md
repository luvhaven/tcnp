# Chat audit and redesign

## Access model

Captain, Vice Captains, Head of Command, and platform administrators automatically access every valid team, program, and Papa chat. Ordinary officers access their assigned team and only the program/Papa rooms where they have an explicit chat invitation. A program invitation does not include its Papa rooms, and operational assignments do not imply chat invitations.

The migration deliberately does not backfill invitations from assignments or past messages. Executives use **Room members → Add people** to invite officers separately to each room. Archived/deleted programs and deleted or mismatched Papas are unavailable, including through direct database requests.

## Findings addressed

| Finding | Change |
| --- | --- |
| Active officers could discover every operational program | Server-provided directory based on exact room invitations |
| Legacy permissive policies allowed cross-program access | Restrictive database policies, exact scope checks, guarded legacy RPCs |
| Program/Papa selectors raced and retained the wrong transcript | One room directory and a fresh conversation instance per account/room |
| Team and program chat used separate implementations | Shared conversation, composer, reactions, receipts, and moderation |
| Member lists contained unrelated officers | Exact room audience; eligible invite candidates visible only to managers |
| Archived programs remained selectable | Directory filtering plus database enforcement |
| Notification requests could target unrelated officers | Stored-message authorization, membership-filtered recipients, idempotent delivery |
| Retrying an uncertain send could duplicate it | Stable message ID and duplicate recovery |
| A send failure could wipe a newer draft | Separate retained failed message with retry/discard controls |
| Paging could miss messages with identical timestamps | Timestamp and UUID keyset ordering |
| Reconnect could retain revoked or deleted content | Fresh authorized history and periodic foreground reconciliation |
| Read markers could be forged for another officer | Caller-bound, visibility-checked bulk receipt RPC |
| Repeated broadcasts used inconsistent topics | Private deterministic room topics; no draft text broadcast |
| Export/archive scope included unrelated Papa rooms | Exact team/program/Papa scope, paged exports, formula-safe CSV |
| Deleted replies exposed original text | Deleted/unavailable reply placeholders |
| Mobile navigation competed with the conversation | Separate directory/conversation views, independent scrolling, keyboard-aware sizing |

## Interface

The workspace uses existing TCNP colors and shared controls, a searchable room rail grouped by program, a compact active-room header, quieter message bubbles, visible focus states, accessible composer labels, full-name mentions, and distinct loading, empty, unavailable, offline, and retry states. Restricted mentions explicitly disclose that executives can also read them.

Bulk permanent destruction is removed from the room menu. Existing authorized per-message deletion remains available. Team selection for unassigned officers remains available without making executives choose a team.

## Verification

Validation covers helper/API tests, actual PostgreSQL execution of the migration against deliberately broad legacy policies, caller and recipient authorization, edit/reply/receipt guards, TypeScript, ESLint, and the production build. CI installs a pinned isolated PostgreSQL test runtime so database integration tests execute rather than skip.

Visual fixtures render the actual components with fabricated data for desktop, narrow mobile, directory, conversation, and dark-mode review. They do not send live messages. These fixtures verify layout; they do not substitute for a physical-device keyboard test or a live multi-account conversation exercise.

## Operational notes

Apply `20261025210000_explicit_chat_room_access.sql` before releasing the application changes. It introduces the membership table and authorization RPCs used by the room APIs. It preserves executive access and restricts ordinary program/Papa participation until explicitly invited.

Message frequency throttling is not introduced. Existing server limits protect management/notification endpoints, and database guards constrain message ownership, scope, size, and metadata. Realtime typing is optional; conversations continue to work if its private channel cannot connect. Membership and room checks also refresh periodically to cover missed realtime events.
