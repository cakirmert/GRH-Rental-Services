# Authentication migration release contract

The authentication release requires the additive `AuthState`, `PasskeyCredential`, and
`PasskeyCredentialAlias` tables and a successful passkey backfill before it receives traffic.
Never deploy the new auth handlers before those prerequisites are complete.

## Preservation and rollout

1. Take and restore-test a fresh database backup. Record the exact production deployment and
   code revision. Keep the production RP ID and canonical origin unchanged.
2. Rehearse migrations, backfill, tests, and rollback against an isolated database clone.
3. Deploy the additive schema without dropping or rewriting `User.passkeys`.
4. Quiesce passkey registration, authentication, and revocation during the final snapshot and
   backfill, or first deploy a separately reviewed compatibility release that dual-writes both
   stores. The currently implemented handlers perform a direct cutover; there is no shadow mode.
5. Run `tsx scripts/backfill-passkeys.ts` with an explicitly selected `DATABASE_URL` in the
   process environment. The script does not silently select a database from `.env.local`.
   Require `legacyUnchanged: true`, matching credential/index counts, and the recorded digest.
   Malformed records, duplicate IDs, alias collisions, or revoked-record conflicts stop the
   migration. Investigate them without deleting or re-enrolling affected credentials.
6. Promote the exact tested release, verify login with an existing credential and OTP recovery,
   and only then reopen passkey operations. New registrations, counters, and revocations are
   transactionally reflected in both the normalized table and legacy JSON.
7. Retain the JSON column, backup, and additive schema throughout the rollback window. Do not
   remove them in this release.

Rollback must use a version that understands both stores and durable ceremonies. The old
whole-array passkey implementation is not a safe rollback target once new writes begin.
If restoring data becomes necessary, preserve post-backup bookings and credential changes;
do not overwrite the live database with an earlier dump as a routine code rollback.

Prepare a static maintenance deployment with zero Functions as the emergency target.
On a cutover failure, keep affected writes frozen and promote that maintenance artifact;
recover with a corrected store-aware application. Project environment inheritance means
that merely omitting a database variable from a deployment command is not sufficient isolation.
Do not reopen old passkey handlers or treat rerunning backfill as reconciliation after old-code
writes: backfill rejects counter/alias drift instead of overwriting an existing index. Final digest/count checks
occur after the backfill transaction commits, so a verification failure must keep maintenance
enabled while the additive index is inspected.

The switch to the new OTP state invalidates outstanding old-format OTPs; users can request a
new code after the short cutover. Existing passkeys and Auth.js sessions are not deliberately
invalidated. `AUTH_SECRET` stays unchanged during the deployment. Recovery OTP limits are
five verification attempts per mailbox per 15-minute window and five issuances per hour.

## Security boundaries

- Ceremonies have independent random challenges, a five-minute expiry, a browser-bound
  HTTP-only SameSite cookie, a flow type, and registration user ownership. Consumption is
  atomic in PostgreSQL and occurs before expensive verification.
- Discoverable authentication returns no account list or credential identifiers. Completion
  uses a unique indexed alias lookup. Legacy double-encoded IDs retain their original and
  decoded aliases; no JSON record is rewritten during backfill.
- Authentication locks the user row before changing a counter or issuing an exchange token.
  Revocation takes the same lock and retains a tombstone. A revoked credential cannot be
  re-created by a login or by rerunning backfill.
- Session exchanges are random, hashed in storage, browser-bound, single-use, and valid for
  one minute. The credential is checked again at consumption.
- Global admission budgets precede attacker-selected keys. Counters use database time and
  atomic upserts; expired state is deleted in bounded batches during traffic and cron cleanup.

## Verification

`webauthn-assertion.test.ts` signs an assertion using a generated P-256 key and confirms that
the retained legacy encoding verifies, while wrong origins and challenges fail.
`auth-state.integration.test.ts` requires an explicit local `TEST_DATABASE_URL` and checks
concurrent budget admission, single-use OTP/exchange consumption, mailbox parsing,
backfill idempotence, JSON preservation, and final revocation. Run browser tests with a
virtual authenticator against the isolated clone before promotion to verify cookie and
session handling through the actual HTTP routes.
