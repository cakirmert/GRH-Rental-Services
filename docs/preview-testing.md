# Hosted preview testing

The V2 preview is prepared at **https://preview.grh-rentals.de**, on the
`codex/v2-rebuild` Git branch. Its deployment and domain mapping use Vercel's
**Preview** environment. Publishing this branch does not release it to production.
Manual deployment is deliberate while `vercel.json` disables automatic Git
deployments for this branch.

## Isolation and access

- The preview uses a separate Neon branch, `v2-preview-20261107`, cloned from
  production on 7 November 2026. Its database password was changed independently
  of the parent. Every database connection alias in the branch-specific Vercel
  settings points to this clone.
- Authentication and cron secrets are independent. Browser cookies remain
  host-only. The live authentication secret, main database and canonical domain
  are unchanged.
- Vercel Standard Protection requires a signed-in, authorized Vercel team member
  for preview access. Production custom domains remain public. No bypass token,
  public share link or protection exception was created.
- `DISABLE_OUTBOUND=true` suppresses email, push, uploads and scheduled jobs;
  GitHub report delivery is disabled. Production integration write credentials
  are absent. Public push and challenge keys are omitted from the client build.
- Database operations inside the app still write to the clone. Test bookings,
  profile changes and reports do not synchronize back to the live application.
- Neon automatic database branching is disabled for both Preview and Production
  deployments. This prevents the integration from replacing the explicitly
  prepared connection at deployment time. The dedicated production branch remains
  `main`; the resource-active deployment check remains enabled.

The clone contains personal data and must remain access protected. Do not copy its
connection strings, exported data or private screenshots into the public repository.
The public README gallery uses synthetic private records.

## Existing passkeys

The preview uses `RP_ID=grh-rentals.de` with its **own exact expected origin**,
`https://preview.grh-rentals.de`. The parent RP is valid from its subdomain under
[WebAuthn's RP identifier rules](https://www.w3.org/TR/webauthn-3/#relying-party-identifier).
The clone retains the original user IDs and credential material. An unrelated
`vercel.app` hostname cannot use these credentials with the same configuration.

Set **`GRH_PASSKEY_SIGNIN_ONLY=true`** on this preview. The server rejects passkey
registration options, registration submissions and revocation, including direct
credential-store calls. The UI disables the corresponding account controls and
explains why. Authentication, replay protection and signature-counter updates
remain enabled on the isolated clone. This prevents an enrollment using the same
RP/account from replacing a device credential used by production. Do not turn
the restriction off merely to test enrollment here; use localhost and a separate
local passkey for that test. Production leaves the flag unset or `false`.

Before preview deployment, additive migrations and legacy passkey indexing were
rehearsed on the hosted clone. Both indexing runs retained all 25 original
passkeys unchanged, with 25 normalized credentials. All original table counts and
the ordered user/passkey digest matched before migrations. A fresh production
backup was independently restored to local PostgreSQL and verified against its
snapshot; private evidence is retained outside Git.

These checks do not prove possession of an existing physical passkey. The owner
must confirm a real-device sign-in on the preview and, separately, on the canonical
production origin during cutover. No successful physical-key test should be
claimed before it has been observed or confirmed by the owner.

## Manual acceptance

1. Open the HTTPS preview URL. Complete Vercel authentication if prompted. This
   gateway is separate from signing in to the rental application.
2. Choose the application's existing-passkey sign-in on the device/browser that
   holds the production passkey. Complete the device confirmation yourself.
3. Verify the expected account and permissions, then test the catalog, a booking
   request, chat, account settings and the relevant staff/admin pages. Changes
   affect only the clone. Check Berlin dates/hours and a Monday-first calendar.
4. Confirm that account settings explain why passkey addition/removal is disabled.
   Do not delete a passkey from the device/password manager during this rehearsal.
5. Report the failing screen and action if anything fails. Avoid putting account
   data in a public GitHub issue. The preview's report queue does not deliver issues.

Hosted preview email is disabled, and it does **not** expose OTPs in responses or
logs. Console OTPs belong exclusively to the guarded localhost workflow described
in the README. A failed existing-passkey test should be investigated before any
production migration rather than bypassed by pointing the preview at live data.

## Remaining production gates

- Keep production on its retained deployment while preview acceptance is pending.
  Code pushes and preview tests do not authorize merging or promoting production.
- The restored Bar weekly rule (Friday 14:00 to Saturday 14:00 Berlin time) has a
  pending-booking conflict in the fresh clone. The restoration dry run stopped
  without changing the booking or adding the rule. Resolve that reservation with
  the owner before restoring the rule in the controlled production window.
- Follow [the release procedure](upgrade-release.md) and
  [authentication cutover contract](auth-migration.md): freeze old incompatible
  writes, take another fresh restore-tested backup, apply additive migrations,
  backfill and verify credentials, deploy the exact tested revision, and confirm
  real-device canonical-origin passkey login plus OTP recovery before reopening.
- Preserve current backup evidence and rollback instructions. A code rollback must
  not overwrite live data with the preview clone or an older backup.

Configuration references:
[Vercel environment variables](https://vercel.com/docs/environment-variables),
[Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication),
[Neon's Vercel integration](https://neon.com/docs/guides/vercel-managed-integration).
