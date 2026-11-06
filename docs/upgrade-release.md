# Upgrade release procedure

This release targets Node 26, Next.js 16.4.5, React 19.3.1, Auth.js
5.0.0-beta.32, and Prisma 7.10.1. The Auth.js prerelease is intentional; Prisma
8 release candidates are excluded. Keep the exact lockfile used for validation.

## Current release gate

The production site has not been changed. The backup was restored to isolated
PostgreSQL, migrations and passkey indexing were rehearsed there, and source,
unit, database-concurrency, type, lint, and production-build checks passed.
Browser tests are present but have not yet run: local server startup was denied
by the execution policy. Hosted preview is also pending isolated credentials.
Do not promote this release until those checks pass.

On 6 November 2026, the calendar candidate passed 500 tests across 68 files with
the host timezone set to New York. The subsequent retention candidate passed
543 tests across 76 files, plus eight focused PostgreSQL retention cases after
the final notification cleanup adjustment, TypeScript, lint and a production
build. The dependency audit reported zero known vulnerabilities. The restored local
database still has 82 users, 91 bookings, and 25 unchanged passkeys; its only
intentional availability change is the confirmed weekly Bar rule. The production
database and backup fingerprints remain unchanged.

The candidate now includes [the reviewed retention policy](data-retention.md):
365-day automatic cleanup only for eligible regular users, manual inactive-staff
review, activity-aware eligibility and complete linked-data cleanup. Migrations
`20261106010000_account_activity` and `20261106020000_notification_actor` are
additive and were rehearsed only on the restored local database. The former
backfills activity from existing sign-in timestamps; the latter lets deletion
remove notification copies associated with their author. The scheduled job no
longer treats an unreturned borrowed item as completed after 14 days.

## Isolated rehearsal

The repository includes a guarded local mode. Copy `.env.test.example` to
`.env.test.local`, choose an isolated loopback database, and generate one stable
test-only authentication secret. Optionally allow the public image CDN origin.
Run `npm run check:local`, `npm run test:local`, and `npm run build:local`.
`npm run start:local` serves only this computer; `npm run test:e2e:local` uses that
already-running site. The runner overrides live integrations and never selects
a database from the production dotenv files. Starting a process still requires
permission from the execution environment; the script does not change that policy.

For manual local sign-in, request an email code with your normal account address.
The isolated runner prints the code in its terminal as `[local-otp]`; no email is
sent. Normal expiry, rate limits, and single-use verification still apply. Console
codes require the explicit local-runner marker, disabled outbound integrations,
loopback database, localhost origin/RP ID, and no hosted deployment metadata.
They are never returned in the HTTP response. A production passkey is bound to
`grh-rentals.de` and cannot authenticate on localhost. After local OTP sign-in,
register a separate local test passkey if desired; the production credential is
unchanged.

Use an explicit process-level `DATABASE_URL` pointing to disposable PostgreSQL.
Do not copy the production environment wholesale into a test deployment. Set
`DISABLE_OUTBOUND=true` to suppress email, push, uploads, and scheduled jobs.

1. Use Node 26 and run `npm ci`.
2. On an empty test database, run `npx prisma migrate deploy`. On a restored
   pre-upgrade database, first verify it matches the baseline schema, then mark
   `20261105000000_baseline` applied with `prisma migrate resolve --applied`.
   Deploy the remaining migrations. Never run `migrate reset`, `migrate dev`, or
   seed against production or a backup that must be retained.
3. Run `npx tsx scripts/backfill-passkeys.ts` with the selected `DATABASE_URL`.
   Require unchanged legacy JSON and matching credential/index counts. Run it
   twice to establish idempotence. Compare all original table row counts and a
   digest of ordered user IDs/passkey JSON with the pre-migration snapshot.
4. Set both `TEST_DATABASE_URL` and `GRH_TEST_DATABASE_URL` to that local URL.
   Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
5. For browser checks, use a separate test-only `AUTH_SECRET`, `RP_ID=localhost`,
   and `AUTH_URL`, `NEXTAUTH_URL`, and `ORIGIN` set to `http://localhost:3100`.
   Build with the same variables, start with
   `npm start -- --hostname 127.0.0.1 --port 3100`, and run `npm run test:e2e`
   in another process with the same variables. Chrome is required. The test
   creates and removes only synthetic local users and uses a virtual passkey.
6. Exercise catalog images, calendar, booking creation and staff transitions,
   account settings, OTP, passkey enrollment/login/removal, chat, and mobile
   navigation. Inspect browser errors and failed application requests.

The new baseline represents the verified pre-upgrade schema. The live database
contains an older initial migration whose SQL is absent from the repository;
retain that history row. Do not rewrite or delete historical migration metadata.

## Vercel preview and configuration

The existing preview environment shares production database, authentication,
storage, email, push, and passkey settings. It must be isolated before preview
traffic is allowed. Use a separate Neon branch/database and preview-only secrets,
with `DISABLE_OUTBOUND=true`. Use a stable preview hostname and matching preview
RP ID/origin for browser passkey tests; production credentials cannot be tested
on an unrelated preview hostname.

`package.json` selects Node 26. `vercel.json` places functions in Frankfurt
(`fra1`), near the database. The two schedules remain at 10:00 and 18:00 UTC.
Preserve the production canonical domain, RP ID, origin, and authentication
secret. Replace the cron secret with a separate random value as part of the
tested deployment; it currently shares the authentication secret.

## Production cutover and recovery

Follow [the authentication release contract](auth-migration.md). Before any
production migration, retain the current deployment/revision and take another
fresh restore-tested backup. Confirm the deployed revision still matches the
rehearsal's source baseline.

The old deployment writes passkeys as whole JSON arrays; it cannot run passkey
operations concurrently with the final backfill. A verified maintenance window
or a separately reviewed compatibility deployment is required. A firewall-based
freeze must cover batched GET and POST tRPC requests, custom passkey exchange,
standard Auth.js passkey callbacks, and every reachable deployment hostname.
Pause scheduled writes and drain in-flight requests before the final snapshot.
Do not assume that blocking only one friendly URL freezes old clients.

Apply only the additive schema, backfill, compare integrity evidence, promote
the exact tested deployment, and verify existing passkey login plus OTP recovery
on the canonical origin before reopening traffic. Preserve all original JSON
and the backup during the recovery window.

The full candidate also includes durable availability blocks. Follow
[recurring-blocks.md](recurring-blocks.md) to restore the confirmed Friday 14:00
to Saturday 14:00 Bar schedule during the frozen cutover. Old server versions
cannot enforce these rules and must not accept bookings once rules are active.
The classic calendar on the new server remains available.

If a problem appears after reopening, freeze affected writes again and fix or
roll forward with code that understands both credential stores. An old UI may
only be restored while incompatible passkey routes remain blocked. Do not
overwrite the live database with an old dump: that would discard subsequent
bookings and credential changes. Outstanding old-format OTPs need reissuing;
the release does not deliberately invalidate existing passkeys or sessions.
