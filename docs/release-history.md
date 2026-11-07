# Release numbering and milestone history

The V2 milestone release is **1.18.0**, without an `rc` or beta suffix. It keeps major
version 1 for the established rental service and counts 18 grouped feature
milestones since its initial foundation. This is a retrospective product-history
ledger based on Git commits, **not** a claim that versions 1.0 through 1.17 were
published or tagged. At this handover there are no semantic release tags;
the recovery tag is not a product release.

Related work is counted together. Small fixes, formatting, merges and bot updates
are not each a milestone. This is an editorial numbering choice, rather than
something that can be calculated objectively from the number of commits.

| Milestone  | Date                | Delivered capability                                                                  | Representative commits                                                  |
| ---------- | ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Foundation | June 2025           | Rental catalog, reservations and original application                                 | `a9c5ea7`                                                               |
| 1          | June 2025           | Image caching and optimization                                                        | `780c40d`, `17e3d10`                                                    |
| 2          | June 2025           | Role-aware admin and rental views                                                     | `c7aae5e`                                                               |
| 3          | September 2025      | Theme and restrained animated-background evolution                                    | `1cc3fce`, `18fdc74`                                                    |
| 4          | September 2025      | Staff notes, booking validation and status notifications                              | `9f23452`, `a7049d1`, `5f4637f`                                         |
| 5          | October 2025        | Turnstile protection and sign-in profile completion                                   | `922f6e2`                                                               |
| 6          | October 2025        | Passkey credential and transport compatibility                                        | `bc4b110`, `ff891ca`                                                    |
| 7          | October 2025        | Contextual help, profiles and email preferences                                       | `8736a9b`, `e35ab0e`                                                    |
| 8          | October 2025        | Staff slot blocking and borrowed-item/cron workflows                                  | `2484b95`, `232ee62`                                                    |
| 9          | November 2025       | Upcoming/past booking views and cached server-rendered catalog                        | `c21c7d0`, `c5870df`                                                    |
| 10         | February–March 2026 | Framework security, upload/contact protection and performance work                    | `a40e556`, `cb989f9`, `a750c62`                                         |
| 11         | March–April 2026    | Team Portal and eventual super-admin model                                            | `7bc1980`, `8c896e8`                                                    |
| 12         | May 2026            | Required room-purpose notes and chat email notifications                              | `52803bf`, `bad8edd`                                                    |
| 13         | November 2026       | Dependency modernization and durable auth/booking security                            | `b947cb1`, `9f48216`                                                    |
| 14         | November 2026       | Improved staff calendar, classic fallback and scoped feedback                         | `66d7ae5`, `1181416`                                                    |
| 15         | November 2026       | Durable recurring Berlin-time availability restrictions                               | `8cc5144`                                                               |
| 16         | November 2026       | Linked retention and manual inactive-staff review                                     | `1f78d72`                                                               |
| 17         | November 2026       | Public problem reporting and dependency maintenance                                   | `d1dcdbb`                                                               |
| 18         | November 2026       | Modular V2 SPA, account isolation, security review, booking UI and developer handover | `9c9f6dc`, `9dc98e3`, `abe178d`, followed by the 1.18.0 handover commit |

Historical features can have been superseded. Voting, for example, was replaced
by the super-admin flag; this table records development history, not every
currently enabled feature. Commit dates are not production deployment dates.
See the [release procedure](upgrade-release.md) for validation requirements.
Deployment acceptance and recovery evidence are kept in private operations records.

## Future releases

The first compatible follow-up, **1.18.1**, refines the contact form, fixes
submission without Turnstile, and uses the current account's email on the server.
It does not change the database schema or passkey storage.

**1.18.2** aligns the public rental contact links with the configured rental inbox
and documents verified-domain mail configuration. It also makes gallery controls
quieter, aligns the booking heading and Back action, explains superadmin rights
in member management, and separates generic public guides from private operations.
Mail credentials remain deployment secrets; no account or booking migration is
required. See [email configuration](email-setup.md).

- `1.18.1`, `1.18.2`, …: fixes and small compatible refinements.
- `1.19.0`, …: a new feature milestone.
- A major bump: a deliberate breaking product/data/API contract, with migration notes.

Update the package version/lockfile and `src/constants/release.ts` together. Keep
existing feedback under its original release ID. After acceptance, record the
released commit and validation evidence; do not infer deployment from Git alone.

The footer pairs the version with the first seven characters of the build's full
commit SHA. Vercel uses `VERCEL_GIT_COMMIT_SHA`; local builds inspect Git. Only
known published revisions receive a GitHub link. Unpublished work is labelled
local. Rebuild/restart after committing to get the final source identifier.
