# Authentication compatibility and migration

The normalized credential tables and authentication state are additive.
Deployments must preserve existing account identifiers, credential material,
legacy aliases and revocation tombstones.

## Migration prerequisites

1. Take a fresh backup and successfully restore it into an isolated database.
2. Rehearse schema changes, passkey indexing and authentication tests there.
3. Preserve the production RP ID, expected origin and authentication secret.
4. Prevent incompatible old handlers from writing during the final migration.
5. Apply the reviewed additive schema, then run `scripts/backfill-passkeys.ts`
   with an explicitly selected database. It must report unchanged legacy data,
   matching indexes and successful verification. Investigate conflicts without
   deleting credentials or asking users to reenroll.
6. Promote the exact tested artifact, verify an existing passkey and email-code
   recovery, and only then reopen affected operations.

The current implementation performs a direct cutover rather than a shadow-mode
migration. New credential updates maintain both representations; do not remove
the legacy column or revocation records as part of an unrelated release.
Outstanding old-format email codes may need to be requested again.

## Recovery

A compatible code rollback must understand the current credential stores and
authentication state. An older whole-array-writing implementation is unsuitable
after new credential writes have started.

Prepare a static maintenance artifact for a failed cutover. Keep affected writes
closed while repairing the compatible application. A database restore is a
separate recovery operation: it can discard bookings and credential changes
created after the snapshot.

Routine compatible code releases do not require repeating this migration.
Maintain exact backup locations, deployment identifiers and preservation results
in the private operations runbook.

## Verification

Run the assertion, authentication-state and database-concurrency suites. Browser
checks should cover email-code sign-in, virtual-authenticator registration,
authentication and revocation against an isolated database. A real-device check
on the intended HTTPS origin is still required for an RP/origin change.
