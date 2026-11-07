# Deployment and recovery

Use the committed lockfile and supported Node version from `package.json`.
The repository's `vercel.json` owns function region, job schedules and the
branch deployment gate. Keep dashboard build commands aligned with repository
defaults. Domains, secrets and deployment protection remain provider settings.

## Rehearsal

1. Install with `npm ci`.
2. Select an isolated database explicitly. For an empty database, deploy the
   Prisma migrations. For a legacy restore, verify its schema before marking an
   existing baseline applied; never assume a baseline matches.
3. Run the guarded local checks, tests and build. Start the local site and run
   browser checks against it.
4. Review dependency advisories and test the relevant user workflows, including
   permissions, time handling and email configuration.
5. Rehearse any schema/data operation against a verified backup restore.

Never run development resets or seeding against production.

## Release

Prepare a fresh, restore-tested backup for data-changing releases. Record the
exact source, artifact, schema state and recovery point in the private runbook.
For authentication changes, follow the [migration contract](auth-migration.md).

Build first, inspect the artifact and deliberately promote it when the deployment
workflow requires manual promotion. Saved environment changes affect new builds,
not already-running artifacts. Verify that the selected environment uses the
expected database, origin, RP ID and secrets.

Prevent incompatible historical deployments from accepting writes. Review a
new artifact's access rules before testing it; do not expose arbitrary previews
to production data.

After promotion, verify normal sign-in, the changed workflow and relevant data
preservation. External mail/issue delivery requires an explicitly labelled
harmless test; local mocks do not establish live delivery.

## Recovery

Keep a static maintenance artifact available for cutovers. Prefer fixing forward
or rolling back to a schema-compatible application. An older application may
lack new authorization, recurrence or credential-store requirements.

Do not restore a stale database snapshot as a routine code rollback. Recovery
must account for bookings, messages and passkey use since that snapshot.
Keep backup locations, deployment IDs, row fingerprints and live verification
results out of public documentation.
