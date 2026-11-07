# Local and hosted preview testing

## Local development

Use the guarded commands in the [README](../README.md#safe-local-setup).
The runner requires a named loopback PostgreSQL database, a test-only secret and
the localhost origin. It strips production credentials and disables outbound
integrations.

For manual local sign-in, request an email code. The local runner prints it as
`[local-otp]` in its terminal; no email is sent. Expiry, rate limits and single-use
verification still apply. Codes are never returned in HTTP responses or exposed
by hosted previews.

Production passkeys cannot authenticate on localhost. Use email-code sign-in and
a separate local test passkey.

## Hosted preview isolation

- Use an independent database and independent authentication/cron secrets.
- Keep cookies host-only and protect preview access.
- Keep `DISABLE_OUTBOUND=true`; omit production integration write credentials.
- Verify every database connection alias points to the isolated database.
- Confirm provider integrations cannot automatically replace that connection.
- Keep private records and screenshots out of the public repository.

A restored clone may contain personal data. Access controls and an explicit
cleanup/retention plan apply even when the preview is temporary.

## Existing-passkey rehearsal

A protected subdomain such as `preview.example.org` can use parent-domain
passkeys when the RP is `example.org` and the exact preview origin is expected.
An unrelated hosting-provider domain cannot use those credentials.

For a clone retaining production account IDs and the same RP, set
`GRH_PASSKEY_SIGNIN_ONLY=true`. The application disables registration and
revocation while allowing existing-passkey authentication. This avoids replacing
a device credential used by production. Use a separate localhost credential for
enrollment/revocation tests.

The operator must confirm a real credential on the intended HTTPS origin.
Successful preview authentication alone does not prove production acceptance.

## Acceptance

Check the catalog, booking request, account settings, messages and relevant
staff/admin screens. Verify Berlin times, Monday-first weeks and role access.
Confirm changes affect only the clone and no external notifications are sent.
Record failures privately without publishing account or booking data.

See [deployment](upgrade-release.md) and the [authentication contract](auth-migration.md).
