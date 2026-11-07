# GRH Rental Services

A bilingual rental service for residents of Gustav-Radbruch-Haus: browse rooms,
equipment and games, request bookings, and communicate with the responsible team.
Rental staff manage their items and bookings; administrators manage the service.

The prepared release is **1.18.0**. The V2 rebuild keeps existing accounts,
bookings and passkeys while separating the application shell, feature controllers,
server policies and database services. It is still unpublished at this handover.
A local build does not mean production has been migrated. Follow the
[release procedure](docs/upgrade-release.md) before deployment.

## Start here

1. Set up the guarded local environment below. Production credentials are unnecessary.
2. Read [authentication and backend changes](docs/auth-backend-summary.md) for
   the problems addressed and the compatibility decisions.
3. Use the architecture map when changing a feature; keep permission and
   availability decisions on the server.
4. Before a release, read the [authentication cutover contract](docs/auth-migration.md),
   [retention policy](docs/data-retention.md) and [deployment checklist](docs/upgrade-release.md).

## Stack

The lockfile is the authority for installed versions. This release was prepared with:

| Layer               | Version / implementation                                               |
| ------------------- | ---------------------------------------------------------------------- |
| Runtime             | Node.js 26.x and npm                                                   |
| Application         | Next.js 16.4.5, React / React DOM 19.3.1, TypeScript 7                 |
| Authentication      | Auth.js (`next-auth` 5.0.0-beta.32), Prisma adapter, SimpleWebAuthn 14 |
| Database            | PostgreSQL, Prisma 7.10.1 with the PostgreSQL driver adapter           |
| API and client data | tRPC 11.25.0, TanStack Query 5, Zod 4                                  |
| UI                  | Tailwind CSS 4.3.5, Radix primitives, React Hook Form                  |
| Checks              | ESLint 10, Vitest 5, Playwright with installed Chrome, Prettier        |

Auth.js remains on its compatible v5 prerelease deliberately; replacing the
provider is not required for the rebuild. Inspect consumers before changing npm
aliases or lockfile overrides. The aliases select supported mail and WebAuthn
implementations while retaining compatible imports. No `--force` or
`--legacy-peer-deps` installation is required.

## Safe local setup

Local development and browser testing use `scripts/local-site.mjs`. It accepts
only a named PostgreSQL database on loopback and serves `http://localhost:3100`.
It removes inherited production credentials, prevents Next.js from merging live
dotenv files, and disables email, push, uploads, scheduled jobs and GitHub delivery.
Normal application requests still write to the chosen local database.

Use an existing isolated database or start a fresh PostgreSQL instance. Docker is
optional; this PowerShell example creates an empty, local-only database:

```powershell
docker run -d --name grh-local -e POSTGRES_PASSWORD=choose-a-local-password -e POSTGRES_DB=grh_local -p 127.0.0.1:55432:5432 postgres:18-alpine
Copy-Item .env.test.example .env.test.local
```

Edit the ignored `.env.test.local`:

```dotenv
GRH_TEST_DATABASE_URL=postgresql://postgres:choose-a-local-password@127.0.0.1:55432/grh_local?sslmode=disable
GRH_TEST_AUTH_SECRET=replace-with-one-stable-random-test-secret-of-at-least-32-characters
# Optional public image CDN origin; no path, query or credentials:
# GRH_TEST_IMAGE_ORIGIN=https://your-public-store.public.blob.vercel-storage.com
```

Generate a test secret once, then keep it consistent across build, server and tests:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Install dependencies and initialize **only that empty local database**. Prisma's
ordinary CLI does not use the local runner, so select its database explicitly:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:choose-a-local-password@127.0.0.1:55432/grh_local?sslmode=disable'
npm ci
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
npm run check:local
npm run dev:local
```

`npm ci` generates the Prisma client; it does not seed the database. On an empty
database the catalog is empty. Optional sample data is available through
`npm run seed`, but that script **deletes the selected database's application data**
and requires both a loopback `DATABASE_URL` and `GRH_ALLOW_LOCAL_SEED_RESET=true`.
Use it only for a disposable scratch database, never a restored backup. Clear
those variables afterward. Seeding is not part of an upgrade.

For a restored pre-upgrade database, follow the baseline and passkey-backfill steps
in [upgrade-release.md](docs/upgrade-release.md) instead of the empty-database
instructions. Never reset migration history or run `migrate reset`, `migrate dev`,
`db push` or seed on production or on a backup that must be preserved.

### Local login and troubleshooting

- Request an OTP with an account email. The server terminal prints `[local-otp]`
  and its code; **no email is sent**. If another person started the server, ask
  them for the current console code or restart it in your own terminal.
- Codes still expire, have attempt limits and can be used only once. They are
  never included in an HTTP response. Console output requires all local-mode
  guards; do not enable it on a hosted deployment.
- Production passkeys belong to `grh-rentals.de` and cannot sign in on localhost.
  Use local OTP, then optionally enroll a separate local passkey. The production
  credential is unaffected. A scratch database does not contain your staff role
  or production account data.
- If sign-in fails after changing the test secret, clear local site cookies and
  rebuild/restart with the same secret. Keep `localhost` consistent: visiting
  `127.0.0.1` in the browser changes the authentication origin.
- If images are absent, configure the optional public CDN origin and rebuild.
  No storage write token is needed to display public catalog images.
- Stop the running server before replacing its production build.

## Commands and verification

| Command                  | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `npm run check:local`    | Validate the isolated environment without starting a server |
| `npm run dev:local`      | Development server, localhost:3100                          |
| `npm run build:local`    | Production build using the isolated environment             |
| `npm run start:local`    | Serve that build, localhost:3100                            |
| `npm run test:local`     | Unit, component and local PostgreSQL integration tests      |
| `npm run test:e2e:local` | Browser checks against the already-running local server     |
| `npm run lint`           | ESLint, including React hooks rules                         |
| `npm run typecheck`      | TypeScript checks                                           |
| `npm audit`              | Known dependency advisories for the installed lockfile      |

For a release rehearsal, run lint, typecheck, local tests and the local build.
Start the built site, then run browser tests in a second terminal. Chrome must
be installed because Playwright selects `channel: "chrome"`. Browser checks cover
OTP/passkeys, SPA navigation, account isolation, booking/staff flows, and layouts
in English/German on desktop/mobile. They create and clean up synthetic rows in
the isolated database; they must not run against production. Screenshot galleries
are generated under ignored `test-results/fullpage-visual/` and `test-results/ui-polish/`.

`npm run dev`, `build`, `start`, `test`, the Prisma CLI and standalone job commands
use the operator's environment directly. They are **not** the guarded local workflow.
The local runner deliberately refuses extra command-line arguments. Its own
environment-validation tests are included in the Vitest suite.
There is no repository GitHub Actions test workflow at this handover; run these
checks before merging or releasing. Dependency alerts do not replace application tests.

## Architecture and navigation

```text
auth.ts / auth.config.ts      Auth.js entry points and compatible provider setup
src/app/                     App Router pages, layouts, route/API handlers, metadata
src/app/_data/               Cached public catalog loading
src/features/
  shell/                     Shared navigation, route handling and application frame
  identity/                  Account-owned auth UI, session boundaries and cache scope
  catalog/                   Public item browsing
  booking-request/           Booking draft controller, form and availability policy
  bookings/                  Resident booking lists, details and actions
  staff/                     Responsible-team booking workflows
  admin/                     Administration views and controllers
  chat/                      Booking conversation UI
src/components/              Shared UI primitives, calendar, help, reporting, footer
src/server/routers/           tRPC transport validation and authorization
src/server/modules/          Booking/administration services, policies and effects
src/server/jobs/             Bounded retention and booking housekeeping operations
src/lib/auth/                Durable OTP, ceremonies, passkey storage, activity tracking
src/lib/berlin-time.ts       Shared Berlin civil-time conversion
src/locales/                 English/German copy and i18n provider
prisma/                     Schema, additive migrations, guarded destructive sample seed
scripts/                    Local runner, passkey backfill and maintenance tools
public/                     Public assets, manifest icons and service worker
tests/e2e/                  Local browser journeys and screenshot capture
ops/maintenance/            Static emergency maintenance deployment
docs/                       Release, security, data and integration handover notes
```

This is a **single-page application for normal in-app navigation**: Next.js links
change the URL and content while keeping the browser document. Routes such as
`/items/:id`, `/bookings`, `/staff`, `/staff/calendar`, `/admin` and
`/messages/:bookingId` are also directly loadable. Server rendering supplies the
initial page. Existing question-mark bookmarks render their destination directly,
without a redirect. New links, emails and notifications consistently use paths.
The home-screen manifest keeps the root start URL and scope.

Feature controllers own transient state, requests and actions; policies hold
decisions that can be tested independently. Reuse services rather than putting
database operations into components or duplicating authorization in a new endpoint.
The authenticated query cache is scoped to account and current role so late
responses from a previous account cannot populate the next session. Authenticated
responses must not enter shared public caches.

## Business and security rules to preserve

### Accounts and authentication

Roles are `USER`, `RENTAL` and `ADMIN`; `isSuperAdmin` provides the additional
administration boundary. Rental access is scoped to item responsibility. Pages
and API operations check current database permissions; hiding a control in the
browser is not authorization. Deletion and role changes have self/last-admin and
super-admin protections.

OTP issuance and verification use database-backed budgets, hashed state and
atomic consumption. Passkey ceremonies are short lived, browser bound and single
use, with RP/origin/challenge and user-verification checks. Credential updates
and revocations share locking; tombstones prevent revoked keys being resurrected.
Production secrets, account IDs, RP ID and origin must remain stable during cutover.

The normalized credential tables are **additive**. Backfill preserves `User.passkeys`
and indexes legacy credential encodings; new writes maintain both representations.
Do not delete the JSON column, aliases or revocation tombstones, change IDs, or
require everyone to re-enroll. The final backfill needs a write freeze covering
old deployments as well as the main domain. A rollback must understand both stores.
See [auth-migration.md](docs/auth-migration.md) for exact gates and tests.

### Bookings, availability and time

All displayed dates, time inputs and weekly restrictions use **Europe/Berlin**;
weeks start Monday. Store booking instants in PostgreSQL and use the shared time
helpers at UI boundaries. Do not use browser/server local time or a fixed UTC
offset to represent Berlin recurring hours. Daylight saving changes must keep
weekly rules at the same local hour.

Booking and administrative mutations use serializable transactions with shared
capacity and recurring-block checks. Availability depends on peak concurrent
quantity, not the sum of every overlapping booking. Suggested start/end times
try to find a fully available period, including intervening days; the server still
revalidates on submission. A UI suggestion does not reserve capacity.

Responsible staff may block their own items; admins may block any item. Durable
weekly rules can have no end date and support exceptions/stopping. Deleting a
creator must not silently remove an operational restriction. The confirmed Bar
rule is Friday 14:00–Saturday 14:00 Berlin time; its controlled restoration is
documented in [recurring-blocks.md](docs/recurring-blocks.md). Calendar feedback and
classic-calendar controls belong only on staff/admin calendar pages.

Booking chat requires participant permission. Sending closes seven days after
booking end; history has a different retention period. PostgreSQL locking enforces
send limits under concurrency. Chat and notifications use polling, not a guaranteed
real-time transport. Private notes and messages must not appear in public catalog
or availability data or generic push payloads. The service worker validates
notification destinations, and logout removes the browser's push ownership.

### Retention and scheduled work

| Data                    | Implemented retention / deletion rule                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regular accounts        | Automatic eligibility after 365 days without both sign-in and activity; responsibilities/open bookings block deletion                               |
| Rental staff and admins | Flagged after the same window; manual review and confirmation, with permission and handover checks                                                  |
| Resolved bookings       | Completed/cancelled/declined bookings removed more than 180 days after their end; linked chats, receipts and notifications removed too              |
| Account-owned data      | Transactional deletion removes owned bookings/chats, sent messages, auth records, passkeys, subscriptions and linked data; feedback text is cleared |
| Public problem reports  | Local rows expire after 30 days, including queued reports; account deletion cascades them                                                           |
| Other categories        | Some notifications, team chat, logs and release feedback have no separate age-based expiry; see the complete policy                                 |

The [full retention document](docs/data-retention.md) explains blockers,
anonymization, preserved operational rules, external copies and remaining policy
decisions. Do not assume deleting an account recalls delivered email, GitHub
issues, provider logs or backups. Protect restored personal data like live data.

Vercel invokes `/api/cron/morning` at **10:00 UTC** and `/api/cron/evening` at
**18:00 UTC**, as explicitly chosen by the owner. These scheduler times stay UTC
even though application times use Berlin. `CRON_SECRET` must be separate from
`AUTH_SECRET`. Jobs report bounded per-task counts and failures. Returning a
borrowed item requires staff confirmation; the old automatic 14-day completion
is not scheduled. Do not run destructive job scripts casually to test scheduling.

## Production integrations and configuration

Use [.env.example](.env.example) as a variable reference, not local-test setup.
Store real values only in ignored files or the deployment's secret settings.
Never give a server credential a `NEXT_PUBLIC_` name.

| Variables                                                                | Purpose                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                           | Selected PostgreSQL database; preview and production must be isolated     |
| `AUTH_URL`, `AUTH_SECRET`                                                | Canonical auth URL and existing signing/encryption secret                 |
| `RP_ID`, `RP_NAME`, `ORIGIN`                                             | Passkey relying party, display name and exact browser origin              |
| `CRON_SECRET`                                                            | Independent authorization for scheduled endpoints                         |
| `CONTACT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_PASSWORD` | Contact recipient and SMTP transport                                      |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`                                           | Verified sender and optional reply destination; blank Reply-To omits it   |
| `BLOB_URL_BASE`, `BLOB_READ_WRITE_TOKEN`                                 | Allowed public image origin and server-only upload credential             |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`                      | Web Push key pair                                                         |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                 | Public challenge site key and server verification secret                  |
| `DISABLE_OUTBOUND`                                                       | Set `true` for isolated rehearsals to suppress outbound integrations/jobs |
| `GITHUB_REPORTS_ENABLED`, `GITHUB_ISSUES_TOKEN`                          | Explicit production-only public-report delivery                           |

Email is suppressed in development/previews. SMTP supports TLS on 465 and mandatory
STARTTLS on 587. Automated mail says not to reply and points to booking chat in
the app. Changing the From address requires provider authorization and DNS setup;
this repository does not create a mailbox. The proposed `grh-rentals.de` sender
setup remains pending. See [email-setup.md](docs/email-setup.md).

The shared header's **Report a problem** dialog stores signed-in submissions in
a durable database queue, with explicit consent before posting publicly to the
fixed GitHub repository. It does not attach private account/browser data or
screenshots automatically. Delivery requires a production Vercel runtime, the
enable flag and a server-only fine-grained token limited to this repository with
**Issues: read and write**. Without configuration, reports remain queued until
their 30-day expiry. Uncertain delivery is reviewed rather than blindly retried.
External issues survive local deletion. See [problem-reporting.md](docs/problem-reporting.md).

Booking email/push effects still run after the transaction without a durable
outbox; the report queue is separate. A successful booking is not proof that all
notifications were delivered. Do not add a blind booking-mutation retry to
compensate for an email failure.

Vercel functions are configured in Frankfurt (`fra1`). Never let a preview inherit
production database/auth/storage/email/push credentials: use an isolated database
and preview-only secrets, with outbound delivery disabled. Preserve the live
canonical domain and passkey settings during release. Review actual project
settings as well as `vercel.json`; repository configuration is not evidence that
a particular deployment ran correctly.

## Release, recovery and maintenance

Before production changes: record the running deployment, make a fresh database
backup, restore-test it, rehearse additive migrations/backfill on a clone, and
verify original row counts and the legacy passkey digest. Prepare a static
maintenance deployment. Freeze incompatible writes across all reachable old
deployments and cron jobs for the final snapshot/backfill. Promote the exact
tested artifact, verify an existing passkey and OTP recovery on the canonical
origin, then reopen traffic. These steps are detailed in the
[release procedure](docs/upgrade-release.md); running `build` does not perform them.

Do not overwrite live data with an old backup as routine code rollback: that loses
subsequent bookings and credential changes. Freeze affected writes and recover
with store-aware code. Retain verified backups through the rollback window,
restrict access and define a rotation/expiry policy separately.

The footer shows `v1.18.0` and a seven-character **build commit**, not a timestamp
or the latest push on an unrelated branch. Published builds link to that exact
GitHub commit. An unpublished local revision is marked local without a broken
GitHub link. `package.json` supplies the version; `src/constants/release.ts`
supplies the feedback/notice release ID. Update both together. Old feedback rows
remain retained under their original release IDs.

The number reflects the mature original app plus 18 grouped feature milestones,
not 18 previously tagged releases. See the evidence in
[release-history.md](docs/release-history.md). Use patch increments for subsequent
fixes, minor increments for features and a major increment when a breaking
contract warrants it. The released name has no `rc` suffix.

Dependabot's weekly npm update schedule is Sunday 08:00 **Europe/Berlin**, with
minor/patch grouping and separate major updates. It takes effect on the default
branch; repository alert/security-update settings are separate. Inspect release
notes and overrides, run the checks, and close superseded dependency PRs only
after verifying the installed graph covers them. See
[dependency-maintenance.md](docs/dependency-maintenance.md).

## Further reading

- [Authentication and backend changes](docs/auth-backend-summary.md): rationale and remaining limitations.
- [Authentication release contract](docs/auth-migration.md): passkey preservation, backfill, freeze and rollback.
- [V2 structure and preview](docs/release-preview.md): implemented scope and validation history.
- [Data retention](docs/data-retention.md): every retained category, account deletion and live read-only observations.
- [Recurring blocks](docs/recurring-blocks.md): Berlin recurrence and controlled Bar-rule restoration.
- [Problem reporting](docs/problem-reporting.md): queue, consent, GitHub token and failure review.
- [Email setup](docs/email-setup.md): sender, provider and DNS configuration.
- [Deployment/recovery](docs/upgrade-release.md): production release gates and isolated rehearsal.
- [Milestone history](docs/release-history.md): version rationale with commit references.

Licensed under [MIT](LICENSE).
