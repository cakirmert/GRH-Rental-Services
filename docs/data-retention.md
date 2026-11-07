# Data retention and account deletion

This describes implemented behavior, not a promise that external copies are
automatically erased. Thresholds are elapsed-day periods; scheduled cleanup can
take additional runs to clear a backlog.

| Data | Retention/deletion behavior |
| --- | --- |
| Regular accounts | Eligible after more than 365 days without sign-in or recorded activity. Open/future bookings, unfinished assignments or item responsibility prevent automatic deletion. |
| Staff and administrators | Flagged after the same inactivity window. Deletion requires manual review and confirmation; role and last-admin protections apply. |
| Completed/cancelled/declined bookings | Deleted after their end is more than 180 days old, including linked booking chat, read receipts, notifications and logs. Open bookings remain protected. |
| Booking chat | Sending closes seven days after booking end. History remains until linked deletion; closing a conversation does not delete it. |
| Team chat | No separate age expiry. A sender's messages are removed on account deletion. |
| Notifications and audit logs | Removed through linked deletion and relevant housekeeping. No general standalone age expiry. |
| Passkeys | Retained while the account exists. Revocation tombstones remain to prevent resurrection. Account deletion removes credentials, aliases and tombstones. |
| Authentication state | Short expiry and atomic consumption. Expired records are physically removed in bounded cleanup batches. |
| Browser sessions | JWT lifetime is one day and can renew with use. Deleted accounts fail subsequent account/session checks. |
| Push subscriptions | Removed on unsubscribe, supported invalid-endpoint cleanup or account deletion. No general age expiry. |
| Proposals and votes | Foreign-key cleanup; validity expiry does not itself delete stored rows. |
| Release feedback | Account deletion clears the account link and free-text comment; unlinked interface/rating records remain. No separate age expiry. |
| Public problem reports | App copies expire after 30 days or account deletion. Published external issues require separate removal. |
| Availability rules | Survive creator deletion without the account link. Item deletion cascades rules and exceptions. |
| Catalog and responsibilities | Items have no blanket age expiry. Responsibilities must be handed over before staff deletion. |
| Backups, mailboxes and provider logs | Separate operator/provider policies; application account deletion does not recall external copies. |

## Linked account deletion

Automatic regular-account cleanup, reviewed staff deletion and voluntary
deletion share a serializable cleanup operation. Eligibility is checked inside
the transaction. Staff confirmation binds the reviewed activity timestamps;
new activity requires another review.

Deletion removes owned bookings and their complete chats, the account's messages
in other conversations, read receipts, notifications, sessions, subscriptions,
proposals/votes, passkeys, legacy tokens, account authentication state and linked
logs. Feedback comments and notification excerpts are also cleared.

Other people's bookings and messages survive. Person references typed into
retained free text cannot be reliably found by a foreign-key cascade and need
targeted review. Operational availability restrictions survive account cleanup.

## External copies

Public issue posting needs explicit consent and does not automatically attach
private account, booking, browser or page metadata. A request already in flight
cannot be atomically recalled by deleting its author.

Mailbox copies, hosting/email-provider records and backups need their own
access, deletion and rotation policy. See [email configuration](email-setup.md).
Do not restore previously deleted accounts from an old backup during routine
recovery.

The job schedules are configured in `vercel.json`. Changing a schedule does not
change the policy's elapsed-time thresholds.
