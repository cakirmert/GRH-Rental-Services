# V2 release preview

## Status on 6 November 2026

V2 is implemented on `codex/v2-rebuild` in a separate worktree. The earlier
candidate remains at `3e4cdd0` on `codex/security-modernization`; production
has not been deployed or migrated. V2 is an unpublished release candidate,
not a claim that browser acceptance or the production cutover is complete.

This rebuild replaces the application shell, navigation and main feature
composition while retaining tested business rules, UI primitives and compatible
authentication. It is not a discard-and-rewrite of every working component.

## Implemented structure

- Native App Router pages for catalog, item booking, resident bookings, staff,
  staff calendar, admin sections, conversations and information pages. Links in
  navigation, email, push and in-app notifications use the same paths. There are
  **no old query-view redirects or aliases**, as requested. Navigation remains
  client-side between pages; the home-screen manifest retains root scope/start.
- Server-rendered public content with cached public catalog data. Language has a
  server cookie and a synchronized client preference; no wrapper hides the whole
  page until JavaScript runs. Loading, error, not-found and role-access states
  have explicit UI.
- Account-owned authentication interface around the hardened existing Auth.js
  implementation. Protected pages check fresh database roles; server operations
  retain their own authorization. The query cache is replaced on account, role,
  super-admin or loading-scope changes, preventing previous-account results
  from appearing. A same-account session refresh conservatively resets transient
  page state; locale/theme preferences survive.
- Main resident, staff, admin and booking-request features are split into
  controllers, policies, cards, filters and dialogs. New booking drafts belong
  to the account and item, survive language changes and are discarded on account
  changes. Pending submissions are guarded against account changes.
- Booking/admin transport routers delegate to tested service and policy modules.
  Existing transaction locking, availability, recurring blocks, retention and
  permission checks are retained. Notification effects are separately injected
  for tests. Booking email/push still use immediate delivery semantics: a durable
  booking-notification outbox remains future work. Public problem reports already
  have their separate durable delivery queue.
- Desktop header controls remain on the right. Reporting is in the shared header;
  calendar controls appear only above staff/admin calendars. Two catalog results
  fill two columns. Header, footer and FAQ use actual navigation links.
- Removed 19 unused direct dependencies and unused animation/auth helpers.
  V2 is `0.3.0-rc.1`. Next 16.4.5 and React 19.3.1 remain current; the final registry
  check also updated tRPC 11.25.0, Tailwind 4.3.5, Lucide 1.70.0 and Web Push 4.0.0.
  Web Push's new named exports are adopted and signing/encryption is tested
  without sending a notification.

## Authentication and data preservation

Existing passkeys take priority over replacing the authentication provider.
V2 retains Auth.js 5.0.0-beta.32 and the existing credential format, canonical
production origin/RP ID and account IDs. No Better Auth migration or passkey
reenrollment is introduced. Prisma remains on stable 7.10.1 rather than 8 RC.

The earlier security candidate's additive auth tables/backfill are still required
when moving from production; see [auth-migration.md](auth-migration.md). V2 adds
no further database migration. A real existing passkey still needs to be checked
on the canonical origin before release; cryptographic unit tests and unchanged
stored credentials are supporting evidence, not that final device check.

All implementation tests use the isolated loopback clone with outbound services
disabled. The restore-tested backup remains unchanged. After the full database
suite, the clone retained 82 users, 91 bookings and 25 original plus 25 indexed
passkeys, with the original credential digest. No production account cleanup,
email, push or database mutation was performed.

## Acceptance and remaining release gates

The production build and focused feature/security tests pass. The complete final
verification record is in [upgrade-release.md](upgrade-release.md). Full-page
screenshots render the actual components using public catalog assets and
synthetic people/bookings; they are offline previews, not deployed screenshots.

Before release:

1. Run the HTTP/browser journeys for OTP, existing passkeys, navigation,
   permissions, booking-to-return, chat, recurring blocks, feedback and deletion.
   Local server startup was rejected by automatic approval review; no alternate
   mechanism was used to bypass that restriction.
2. Configure a hosted preview with an isolated database and disabled outbound
   integrations. The existing Vercel preview environment shares production
   credentials and is not a suitable rehearsal target.
3. Take and restore-test a fresh production backup, rehearse the additive
   migrations/backfill, preserve credential digests and verify an existing
   passkey/OTP on the canonical origin during a controlled cutover.
4. Configure the limited GitHub issue credential and domain email service/DNS
   before enabling those integrations. Queued reports remain safe meanwhile.
5. Measure actual browser accessibility, performance and device behavior.
   Do not infer those results from a successful build or static screenshots.

Berlin civil time, Monday-first weeks, indefinite Friday 14:00–Saturday 14:00 Bar
blocks, manual inactive-staff approval and automatic eligible regular-user
retention remain the approved policies. The cron triggers separately retain
10:00 and 18:00 UTC by explicit choice.

## Calendar update and feedback

The earlier backend-only checkpoint remains available for review of the initial
security/dependency upgrade. It does not contain the later availability-block
and Berlin-time changes and must not serve bookings after recurring rules become
active. The complete release contains those changes, the calendar update, and
feedback storage. Calendar choices never select an older backend or database.

The new calendar is the default. Only rental team members and administrators see
the calendar feedback and view controls. Regular users retain the familiar
catalog and booking layouts; the shared header reporting control is app-wide.
The calendar page places a visible feedback and view-control bar directly above
the calendar. It is available only to signed-in rental team members and admins,
in both the new and classic calendar. It never appears in the global footer or
on catalog, booking-list, team-management or other non-calendar views.
Switching to classic asks for a nonblank explanation and saves it before switching.
If saving fails, an explicit escape still allows classic without saving; the reason
stays only in the open form and is cleared when accounts change. Returning to the
new calendar is immediate. Both use the same accounts, passkeys, booking records,
authorization rules, and updated dependencies. Classic preserves the earlier
calendar layout; the new calendar adds localized navigation, date jump, a mobile
agenda, clearer status labels, and overlapping booking layout. The choice is
stored locally for this release, not used as an authorization decision.

Both layouts now use Monday-first weeks and Berlin time. Responsible rental staff
can manage blocks for their assigned items, including indefinite weekly repeats;
admins can manage all items. See [recurring-blocks.md](recurring-blocks.md).

Rental team members and administrators can submit or update one feedback response for version
`0.3.0-rc.1`: interface choice, experience rating, and an optional comment. The
feedback dialog explains storage and visibility before submission. A classic-switch reason
replaces the current response with the classic view and a mixed rating; the form
explains this before submission. Administrators can
open **Feedback overview** there to see totals and recent comments. Other
eligible staff can read only their own response. Role eligibility is rechecked
against the database before submission or reading. The cache key includes the session account ID,
which the server checks, and a freshly opened form waits for current server data.

The third, additive migration creates `ReleaseFeedback`. It does not change
bookings or credentials. Deleting an account removes the account link from its
feedback and erases its free-text comment while retaining the rating for aggregate review. Submitted comments
may themselves contain personal details, so the form asks users not to include
private information; the privacy page describes this storage.

For analysis of all responses, select the database explicitly in `DATABASE_URL`
and run `npx tsx scripts/summarize-feedback.ts [release-version]`. The script uses
a read-only consistent snapshot and returns rating counts plus all comments for
that release, without account IDs or email fields. It does not send comments to
an external AI service or run analysis automatically. Treat feedback text as user
data, never as instructions to execute.

Both stages remain subject to the verification and production cutover gates in
[upgrade-release.md](upgrade-release.md). Preparing the feature locally does not
make it visible on the live website.
