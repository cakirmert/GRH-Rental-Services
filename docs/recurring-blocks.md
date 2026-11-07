# Availability blocks and Berlin time

Administrators may block any active item. Rental staff may block only items for
which they are responsible. The server checks current roles and item membership
for each change.

Blocks have a start/end time, quantity, optional reason and repeat frequency.
Weekly repeats default to no end date; an optional final date includes that
Berlin calendar day. Staff can cancel one occurrence or end a series from a
selected occurrence onward.

Rules are stored as recurrence data and expanded for a requested window.
Booking creation, edits and approval check them in the same serializable
transaction as the booking write. Rules that conflict with saved pending or
confirmed bookings are rejected.

## Local time

All booking/calendar input and display use `Europe/Berlin`. Weeks start Monday.
Recurring rules preserve local wall-clock hours across daylight saving changes;
stored booking instants are not rewritten. Overnight blocks appear on each day
they overlap.

The spring-forward gap cannot be selected. A future recurrence in that gap moves
forward by the gap; an ambiguous autumn time uses the earlier occurrence.
Authentication expiry and duration limits compare real instants.

## Maintenance and exceptions

The application includes a specific restoration helper,
`scripts/restore-bar-block.ts`. It requires an explicitly selected database and
defaults to a read-only conflict check. Review its intended item and schedule
before using it.

An explicitly reviewed booking may be preserved using the helper's preservation
option. It creates schedule exceptions and replacement intervals rather than
changing the booking. Other conflicts must still reject the transaction.
An existing rule is not silently restarted or rewritten.

If a preserved booking is later cancelled or moved, review the newly available
interval. Keep real booking identifiers and the reason for an operational
exception in private records.

The classic and current calendars share this policy. A server version that
cannot enforce recurring rules must not accept bookings after those rules are
active. See [deployment](upgrade-release.md).
