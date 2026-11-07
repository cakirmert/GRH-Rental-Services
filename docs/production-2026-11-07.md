# Production release — 7 November 2026

**1.18.0 was released at https://grh-rentals.de**, from
`5e46951e898681efb414db4af120a94f2bc8bf9a`, Vercel deployment
`J8s4oyzzcVa2V2PBWhYAtuX4SB1r`. The merge retained the tested application tree.
The owner confirmed existing-passkey sign-in on both the isolated preview and
the canonical production site.

## Data preservation

Old API writes were frozen across deployment hosts and in-flight work drained.
A separate static maintenance deployment served the live domain during cutover.
The final 11:11 UTC snapshot was backed up and restored to isolated PostgreSQL:
**83 accounts, 90 bookings and 25 passkeys**. Earlier rehearsal counts describe
older snapshots; the final frozen snapshot is the production integrity baseline.
Private archive paths, hashes and row fingerprints are retained outside Git.

The baseline was marked applied without removing historical migration metadata.
Six additive migrations and the idempotent passkey backfill were applied. Full
row fingerprints for all 15 original application tables matched before and after
migration. The reviewed pending Bar reservation was retained unchanged while
restoring the weekly restriction with one occurrence exception and a shortened
replacement block; see [recurring blocks](recurring-blocks.md).

A read-only comparison after live sign-in found all 90 original bookings
unchanged and all 25 original passkey credential materials preserved. Counters
and last-used timestamps can legitimately advance on sign-in; do not restore
their old values from a backup.

## Validation and configuration

The release passed 866 tests in 104 files, 15 local browser checks, TypeScript,
lint with zero warnings and the Vercel production build. npm audit and GitHub's
open default-branch Dependabot alerts reported zero known vulnerabilities at
cutover. These are point-in-time results, not a security guarantee.

Vercel uses Node 26.x, repository command defaults, Frankfurt functions, and the
existing 10:00 / 18:00 UTC jobs. The cron secret is independent of the unchanged
authentication secret. Canonical origin, RP ID and production database are
unchanged. GitHub report delivery remains disabled pending its separate token.
See [email configuration](email-setup.md) for the mail setup's current status.

## Subsequent deployments and recovery

- Production tracks `main`, with **automatic production-domain assignment off**.
  Pushes create staged production builds. Inspect and deliberately promote a
  successful build; building alone is not a release.
- Keep **GRH: block legacy deployment APIs** enabled. It denies `/api` on
  unapproved deployment hosts, including old artifacts with incompatible passkey
  writes. Add a reviewed new immutable hostname to its allowlist before testing
  that artifact. Do not open arbitrary previews against live data.
- Stable production hostnames and the approved isolated V2 preview are allowed.
  Preview has its own database and secret, with outbound integrations disabled.
  Standard Vercel protection remains on generated deployment URLs.
- Retained production maintenance deployment
  **`AQdT9zEbTnKnGUpGP5YFUyUREbRu`** has one static asset and no functions. It
  can serve an emergency maintenance rollback. Do not roll auth back to the old
  whole-array-writing implementation.
- Ordinary compatible updates do not need another baseline resolution, passkey
  migration or database restore. For a recovery, freeze affected writes and fix
  forward with compatible code. An old dump would discard subsequent bookings
  and credential use and needs a separate recovery plan.

The protected preview and its restrictions are documented in
[preview testing](preview-testing.md). Original cutover requirements remain in
[the authentication contract](auth-migration.md).
