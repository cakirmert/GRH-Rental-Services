# Data retention and account deletion

Reviewed on 6 November 2026. These are the complete release candidate's rules.
They are not yet live. The owner confirmed that regular users remain automatic,
while inactive rental staff and administrators require manual deletion approval.

## Retention rules

| Data                                                   | Candidate behavior                                                                                                                                                                                                                        | Assessment                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regular user accounts                                  | Eligible after more than 365 days since both sign-in and recorded account activity. Evening cleanup processes up to 100 candidates. Open/future own bookings, unfinished assignments and item responsibility prevent deletion.            | A practical annual inactivity window for a residence service. Activity is recorded at most daily so a renewed session is not mistaken for inactivity.                                                                                    |
| Rental-team and administrator accounts                 | Flagged after the same 365-day inactivity window; never automatically deleted. Admin review offers Delete account, then Confirm deletion.                                                                                                 | Matches the owner's decision. Responsibilities and open bookings must be handed over. Only a super-admin may delete another ordinary admin; self, super-admin and last-admin protections remain.                                         |
| Completed, cancelled and declined bookings             | Morning cleanup deletes bookings whose end was more than 180 days ago, in batches of 500. Deletion also removes their threads, all chat messages/read receipts, notifications and booking-linked logs.                                    | Six months is a reasonable operational default, subject to any actual dispute or recordkeeping need. Open bookings are not silently purged.                                                                                              |
| Booking chat                                           | Sending closes seven days after booking end. History remains until its booking is deleted, or a sender deletes their account.                                                                                                             | Closing a chat and deleting it are different operations. Deleting an owner account removes the entire owned booking thread, including replies from other people.                                                                         |
| Team chat                                              | No independent age-based expiry. A sender's messages disappear when their account is deleted.                                                                                                                                             | Consider a 180-day rolling window if this feature is used; not enabled without a policy decision. Currently no live rows.                                                                                                                |
| Notifications                                          | Removed by user clearing, parent booking deletion, or account deletion. Sender-message excerpts in other booking notifications are cleared when that sender is deleted. No standalone age-based expiry.                                   | Consider 90 days for read notifications and 180 days for unread alerts. These are proposals, not implemented policy.                                                                                                                     |
| Audit logs                                             | Linked account/booking deletion removes corresponding records. Daily housekeeping removes legacy orphan references, in bounded batches. Other logs have no standalone age-based expiry.                                                   | Consider a 180-day limit for remaining logs; current retention is unbounded for records whose parents remain.                                                                                                                            |
| Passkeys                                               | Kept while the account exists. Removing a passkey revokes it; a tombstone prevents old credentials being resurrected. Account deletion removes credentials, aliases and tombstones.                                                       | Do not remove tombstones independently while the account survives. No biometrics are stored.                                                                                                                                             |
| Sign-in state                                          | OTP/challenges expire after five minutes; passkey exchanges are shorter lived. Consumed records are removed immediately. Expired AuthState, legacy verification tokens and database sessions are cleared in bounded housekeeping batches. | Expiry rejects use immediately; physical cleanup can happen later. Anti-abuse budgets remain until their short expiry rather than being reset by account deletion.                                                                       |
| Browser session                                        | JWT lifetime is one day and can renew through continued use. Deleting the account makes subsequent session checks invalid.                                                                                                                | Account activity tracking covers continued use without a new credential sign-in.                                                                                                                                                         |
| Push subscriptions                                     | Kept until unsubscribed, removed after an invalid endpoint response where implemented, or cascaded on account deletion. No age-based expiry.                                                                                              | Review stale endpoints; age alone does not establish that a subscription is unusable.                                                                                                                                                    |
| Role proposals and votes                               | No age-based deletion. Proposal expiry limits validity, not storage. Deleting the creator/target/proposal/voter removes linked records through foreign keys.                                                                              | Currently unused live tables. Define a retention limit before relying on them for ongoing governance.                                                                                                                                    |
| Release feedback                                       | Kept until a separate policy is set. Account deletion clears the free-text comment and account link; unlinked interface/rating records remain.                                                                                            | Consider keeping individual responses for one release cycle or 12 months, then only aggregate counts. These are proposals.                                                                                                               |
| Recurring availability blocks                          | Retained until stopped/deleted as operational item rules. Deleting the creator removes the account link, not the restriction. Item deletion cascades its rules and exceptions.                                                            | Prevents an account cleanup from unexpectedly reopening unavailable time slots. Reasons may remain as operational text.                                                                                                                  |
| Item catalog and responsibility membership             | Items persist while used by the service. Staff must transfer responsibilities before deletion; deletion removes the account's membership link.                                                                                            | No blanket age-based item deletion.                                                                                                                                                                                                      |
| Backups, delivered emails, hosting/email-provider logs | Outside the app database's cleanup. No universal retention period is implemented by this repository. Existing release backups are deliberately retained.                                                                                  | Keep the verified rollback backup through release validation, then adopt a documented backup expiry/rotation policy. Do not restore deleted accounts from an old dump. Already delivered emails cannot be recalled by database deletion. |

The background jobs retain the explicitly chosen 10:00 and 18:00 UTC schedules.
Thresholds are elapsed 180/365-day periods, not calendar-month/year arithmetic.
Deletion occurs on the next successful run and may take additional runs for a
backlog. Hosting scheduling precision and failures can add delay.

## What account deletion covers

Automatic regular-user deletion, approved inactive-staff deletion and voluntary
account deletion share one serializable cleanup operation. Eligibility is checked
again inside the transaction; concurrent activity or booking changes cause the
decision to be skipped/rejected instead of deleting based on an old screen.
The administrator confirmation also binds the activity/sign-in timestamps shown
on the review screen. A changed account must be reviewed again.

The operation deletes owned bookings and their complete chats, the person's sent
messages in other threads and team chat, read receipts, account notifications,
sessions, push subscriptions, proposals/votes, passkeys, legacy email tokens,
account-bound authentication state and linked audit records. It clears feedback
comments and message-preview notification copies. Other people's bookings and
messages survive. References written by someone else in retained notes/status
text cannot be reliably identified and removed by a foreign-key cascade; they
need targeted review when relevant. Operational availability blocks survive.

New person-authored notifications carry an `actorId` foreign key, so deleting
their author also removes copies delivered to other accounts. The foreign key
prevents a delayed notification insert from recreating those copies afterward.
For legacy notifications without an actor, cleanup conservatively removes
unattributed alerts in conversations where the departing user sent messages;
identified notifications from other authors survive.

Voluntary account deletion also requires item and unfinished assigned-booking
handover. Super-admin/last-admin protections prevent accidental loss of control.

## Problems found and corrected locally

- The deployed inactivity job could delete any role, including admins, and removed
  bookings before account deletion without one transaction. The candidate restricts
  automation to regular users and protects ongoing responsibilities.
- Sign-in timestamps alone could label a continuously renewed session inactive.
  `lastActiveAt` is backfilled from the existing sign-in timestamp, then updated
  on authenticated use at most daily. Existing users are not all marked newly active
  on deployment day.
- Log rows and legacy verification tokens lacked account/booking cascades.
  Shared deletion and housekeeping now cover them.
- Feedback comments and copied chat excerpts could outlive their author account.
  The candidate removes those copies while preserving other people's bookings.
- The scheduled 14-day job marked borrowed items completed without a return
  confirmation, defeating open-booking retention protection. It is no longer
  scheduled; staff must confirm completion.
- The auto-borrow job could mark an already-ended accepted booking borrowed before
  expiry cancellation saw it. It now requires an end time still in the future.
- Cron logs previously showed no safe per-task deletion totals. They now record
  numeric counts, status, duration and completion time without account details or
  raw database error messages.
- Public privacy copy overstated deletion and omitted retained categories. It now
  describes the actual candidate rules instead of claiming blanket compliance.

## Live read-only evidence

Production still runs commit `1feb7de489d927e2a5785f19566c66c034f80fb3` from
10 July 2026. Vercel lists both cron schedules as enabled and the deployed cron
secret setting is present. Historical log queries returned no rows, even without
a cron filter, so past successful execution is **not proven**.

At the 6 November 2026 snapshot, none of 82 accounts had a sign-in older than
365 days: 76 regular users, two rental staff and four admins (one super-admin).
There were no borrowed bookings and no expired pending/accepted bookings.
One of 91 bookings had crossed the 180-day threshold since the previous morning
slot; that is consistent with daily cleanup delay, not evidence of a failed job.

The database contained 106 expired legacy verification tokens and 341 logs,
including 178 missing-booking references and three missing-user references
(categories may overlap). There were 61 booking-chat messages, 237 notifications,
47 push subscriptions and zero team-chat/proposal/vote rows. These are aggregate
observations; no live cleanup endpoint or deletion was invoked.

## Recommendations still requiring a policy decision

Keep the existing 365-day regular-account and 180-day resolved-booking windows.
Add explicit limits for standalone logs, team chat, notifications and release
feedback, and define backup/provider retention. The proposed windows above are
operational suggestions, not a legal certification. Applicable obligations and
actual service needs determine the appropriate period; there is no single GDPR
period that automatically validates every category. See the
[European Commission's storage-limitation guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en).

Deploy only after the remaining browser authentication/release gates in
[upgrade-release.md](upgrade-release.md) pass. Test fixtures use isolated accounts;
the live database and original restored users/bookings/passkeys are preserved.

## Validation of this revision

The complete suite passed 543 tests across 76 files. After the final legacy
notification cleanup adjustment, all eight PostgreSQL retention cases passed
again. TypeScript, lint and the production build passed. Tests cover inactivity
boundaries, activity refresh, staff permission/handover checks, stale review
rejection, deletion cascades and notification-copy races. Database integration
files run sequentially to avoid unrelated serializable predicate conflicts;
the concurrency scenarios inside those files remain concurrent.

After testing, the restored baseline still matched the retained backup: 82 users,
91 bookings, 25 chat threads, 60 messages, 235 notifications, 47 push subscriptions,
340 logs and 105 legacy tokens. All 25 legacy passkeys and their 25 indexed
credentials remained, with the original passkey digest and backup SHA-256
unchanged. Production has newer activity, so its snapshot counts differ from
this restored baseline. No production cleanup or account deletion was run.

The staff review screenshots use real components with synthetic fixture data.
They verify the desktop/mobile layout and confirmation dialog, not a complete
live browser authentication or deployment test.
