# Release previews and rebuild proposal

## Current candidate: what changed

The candidate contains targeted backend refactors, dependency upgrades and UI
changes; it is not a new application built from scratch. Its new calendar is for
staff, while the shared reporting control, time handling and authentication
changes also affect regular users. Production still serves the earlier release.
Screenshots of local components must be labeled as candidate previews, with
synthetic account/booking data, rather than screenshots of the deployed site.
The full-page preview review also exposed clipped mobile booking actions and
overlapping status filters. The follow-up makes those actions wrap, groups
resident status filters in one responsive tab list, and fills in the missing
German assigned-person chat label. These are usability fixes to the established
pages, not the proposed V2 redesign.

The largest structural work already completed is durable authentication state
and passkey indexing, transactional booking/availability rules, centralized
account deletion and retention, and durable report delivery. The established
catalog, booking and administration page architecture largely remains.

## Proposed V2 rebuild (not implemented)

Assessment dated 6 November 2026, against `d1dcdbb` plus the subsequent header
reporting and responsive booking improvements. This is a proposal, not a second
deployed application.

A fresh implementation alongside the existing application is justified by
concrete remaining coupling: eleven logical views share one Next page and a
custom history/context layer; several main components are 900–1,250 lines;
`ViewContext` imports `BookingFormView` while that view imports the context;
most page bodies are client-only; and auth-library hooks/types are spread
throughout the UI. Large routers still combine authorization, validation,
database transactions and notification side effects. These are maintainability
and performance concerns, not additional verified security findings.

Build a new application structure while preserving the existing account IDs,
bookings, relationships, passkeys and validated business rules. Keep the current
candidate as a recoverable checkpoint. Avoid parallel production writers until
their shared-schema compatibility has been proven.

The user's priority clarified on 6 November is that existing passkeys keep
working. Replacing the authentication provider is optional and must not force
credential re-enrollment or block the application refactor. Retaining a supported,
security-patched compatible dependency version is acceptable when a newer
version would break existing credentials. Begin V2 with the hardened current
authentication implementation behind a small application-owned interface.

### Stack policy

Prefer the latest supported stable versions, with an explicit authentication
compatibility exception where necessary, a clean dependency tree and no known
audit findings. Recheck versions at implementation and release time.
The current candidate already uses Next 16.4.5 and React 19.3.1, the latest
stable releases checked on 6 November. Auth.js v5 is still beta; v4 is in
maintenance mode. Better Auth 1.7.18 is an optional stable replacement candidate,
subject to a demonstrable benefit and the passkey proof below. Retaining the
current provider is the baseline. Better Auth's Prisma adapter currently supports
Prisma 7, not the Prisma 8 release candidate. A newer npm tag or transitive
major version is not sufficient reason to override a library's supported range.

Keep PostgreSQL/Prisma, TypeScript and the existing testing tools unless a
specific incompatibility justifies replacing them. Remove unused runtime
dependencies after import analysis, clean installation and build verification;
known candidates include `@trpc/next`, `next-intl`, `node-cron`,
`react-big-calendar` and unused animation scaffolding. Consolidate localization,
date handling and calendar implementations. Retain a date picker where forms
need it. Do not replace functioning libraries merely because they are old.

Official references: [Next registry](https://registry.npmjs.org/next/16.4.5),
[React registry](https://registry.npmjs.org/react/19.3.1),
[Auth.js support status](https://authjs.dev/getting-started/integrations),
[Better Auth registry](https://registry.npmjs.org/better-auth/1.7.18),
[Prisma adapter compatibility](https://better-auth.com/docs/adapters/prisma).

### Implementation sequence and acceptance gates

1. **Lock down the identity compatibility contract first.** Start with the
   current hardened authentication/passkey implementation behind an auth facade
   and retain its regression tests. Changing providers is a separate optional
   decision; the wider rebuild does not depend on it. If evaluating Better Auth,
   use a disposable clone and additive auth tables/columns. Map nullable
   verification timestamps and required user
   fields without losing originals or changing account IDs. Import synthetic
   legacy credentials and test cryptographic assertions, double-encoded IDs,
   alias collisions, counter updates and concurrent revocation. Preserve the
   canonical RP ID/origin and credential ownership. Better Auth's standard
   Auth.js migration guide does not document importing this custom passkey
   store, so a conversion/compatibility adapter is required. If the standard
   plugin cannot preserve these security properties, keep the proven credential
   service and compatible dependencies behind the auth facade. Do not require
   users to register replacement passkeys merely to upgrade a library.
   Treat session migration separately: users may need to sign in again, without
   re-registering passkeys. Require a real-device canonical-origin check before
   claiming passkeys are preserved end to end.
2. **Create the application shell and real routes.** Use App Router pages for
   catalog, item details, bookings, staff, administration and information pages.
   Preserve old deep links with explicit redirects. Render public content on
   the server and keep interactive calendars, forms and chat as client
   components. Establish one shared header/report control, one localization
   mechanism, reusable form primitives, and explicit loading/error/empty states.
3. **Move complete rental journeys into domain modules.** Separate identity,
   inventory, availability/bookings, chat/notifications, retention and feedback.
   Keep transport handlers thin and enforce authorization inside each operation.
   Reuse verified transaction and Berlin-time policies, rather than reintroducing
   their former bugs. Persist notification/email work in an outbox committed
   with the operation it describes. Build catalog-to-booking-to-handover/return
   as a vertical slice before adding the remaining admin workflows.
4. **Prove parity and usability.** Cover guest browsing/contact/login trouble;
   OTP/passkey sign-in, enrollment and removal; booking creation/edit/cancellation;
   staff approval, assignment, borrowing, return, chat and recurring blocks;
   administration and two-click inactive-staff deletion; feedback and durable
   issue delivery; legal/privacy pages and bilingual content. Retain Monday-first
   weeks, Berlin civil time, confirmed indefinite Bar hours, and the separately
   agreed 10:00/18:00 UTC cron schedules. Require browser journeys, database race
   tests, accessibility checks, mobile screenshots and measured performance.
   The candidate's existing 634 tests are useful regression evidence, but do
   not replace those end-to-end journeys.
5. **Rehearse and cut over the exact tested build.** Take a fresh backup and
   restore it; compare row counts, foreign-key relationships and credential
   digests before and after repeatable migrations. Test on an isolated database
   with outbound integrations disabled. Freeze incompatible old writers during
   final backfill, verify existing passkeys and OTP on the canonical origin,
   then reopen traffic. Rollback must preserve post-cutover bookings, counters
   and revocations. Retain original data and compatible recovery code throughout
   the recovery window; never reset production or restore an old dump over new
   activity as a routine rollback.

The app's main purpose and user permissions remain the same. The optional
classic-calendar preference selects only a view on the new backend; it must
never route bookings to the old backend. Retire that view only after reviewing
feedback and accounting for needed functionality.

Do not let the larger rebuild indefinitely postpone remediation of the live
site. The current security candidate can be released separately once its
existing browser, database-isolation and cutover gates pass. Neither that
candidate nor V2 should be promoted solely because local unit tests pass.

Auth reference: [official migration guide](https://better-auth.com/docs/guides/next-auth-migration-guide).
Route/rendering references: [Next layouts and pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages),
[server and client components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

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
`0.2.0-rc.1`: interface choice, experience rating, and an optional comment. The
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
