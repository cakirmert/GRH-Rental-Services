# Authentication and backend changes

This describes the complete unpublished candidate, including the security
modernization before the V2 rebuild. Production is unchanged.

| Area                     | Earlier issue or reason                                                                                                                             | Candidate change                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passkey sign-in          | Authentication state needed durable, atomic ownership/expiry checks; credential discovery and whole-array updates increased exposure and race risk. | Browser-bound, single-use database ceremonies; indexed credential aliases; ownership/origin/challenge checks; locked counter updates and revocation tombstones. Legacy credentials are retained. |
| OTP and session exchange | Issuance, attempts and consumption needed consistent limits across server instances.                                                                | Hashed short-lived state, atomic consumption, database rate budgets and guarded local-only console codes.                                                                                        |
| Authorization            | A client/session role can become stale, and access must be scoped to actual responsibility.                                                         | Fresh database checks at protected operations/pages; staff item responsibility checks; strict admin/super-admin boundaries.                                                                      |
| Account switching        | A shared client query cache could briefly show the previous account's data.                                                                         | New cache and component scope for identity/role changes, including isolation of late results.                                                                                                    |
| Availability             | Concurrent requests and recurring weekly rules needed a common authoritative check.                                                                 | Transactional concurrency checks and Berlin-time recurrence policies shared by booking/admin services.                                                                                           |
| Retention                | Inactivity cleanup could remove staff automatically; partial linked cleanup and assumed returns could lose important state.                         | Automatic cleanup only for eligible regular users; reviewed two-click staff deletion; transactional linked cleanup; no assumed return after 14 days. See the detailed policy.                    |
| Problem reports          | User reports needed reliable storage and clear public-posting consent.                                                                              | Local durable queue with idempotent delivery, production-only integration, 30-day app retention and no automatic private metadata attachments.                                                   |
| Notifications            | Links depended on old query routes; service-worker destinations needed precise origin validation.                                                   | Consistent native paths, exact-origin validation and direct window navigation.                                                                                                                   |
| Maintainability          | Large route handlers mixed transport, policy, database work and side effects.                                                                       | Separate booking/admin service modules with unchanged tested business contracts and injected effects.                                                                                            |
| Dependency maintenance   | Framework and transitive packages had become outdated.                                                                                              | Current stable supported versions, unused dependency removal, lockfile audit, Dependabot and weekly review setup. Auth.js compatibility and Prisma RC exclusions are deliberate.                 |

Browser follow-up also corrected two ordinary functional bugs: PostgreSQL filters
excluded staff bookings whose notes were NULL, and an extra whitespace child
inside the profile dialog portal crashed with the updated UI library. Both have
regression coverage; the actual passkey sign-in and profile-saving browser flow
now passes. All 18 remaining React lint warnings were corrected without
disabling rules. Existing question-mark bookmarks render directly, with the
same permissions and no redirect; normal navigation keeps the same browser document.

The provider is still Auth.js; V2 does not require users to register new passkeys.
Upgrading the framework, React, build tools and supported libraries is maintenance,
not proof that each old version had an exploitable flaw. Zero known npm audit
findings is useful evidence, not a guarantee that no vulnerability exists.

See [authentication cutover](auth-migration.md), [retention periods](data-retention.md),
[V2 scope](release-preview.md) and [release gates](upgrade-release.md).
