# Availability blocks and Berlin time

Administrators can block any active item. Rental staff can block only items whose
responsible team includes them. Every change rechecks the current database role
and item assignment. Being assigned to an individual booking does not grant item
blocking rights.

Choose a starting date and time, an ending date and time, quantity, optional
reason, and repeat frequency. Weekly repeats have **No end date** selected by
default. An optional final date includes that whole Berlin calendar day. Staff
can cancel one occurrence or end the series from a selected occurrence onward.
Ending an already stopped series cannot reactivate later dates.

New blocks are durable recurrence rules, expanded only for the requested window;
they do not create a finite batch of fake bookings. Booking creation, edits, and
approval all check these rules inside the same serializable transaction as the
write. A new rule that would invalidate an existing pending or confirmed booking
is rejected as a whole. Resolve that conflict explicitly before retrying.

## Time and calendars

All booking forms, calendar navigation and grouping, booking displays, email
times, chat dates, and account timestamps use `Europe/Berlin`, independently of
the visitor's or server's timezone. Weeks start on Monday in both calendar layouts
and date pickers. Overnight blocks appear on every day they overlap.

Recurring rules preserve the Berlin clock time. Friday 14:00 stays Friday 14:00
when the UTC offset changes. Stored booking instants are not rewritten. The
nonexistent spring-forward hour cannot be selected. A recurring rule whose
future time falls in that gap moves forward by the gap; an autumn repeated time
uses its earlier occurrence consistently. The calendar displays a single
24-hour clock grid, with the missing spring hour disabled.

The two existing background job schedules remain at 10:00 and 18:00 UTC, as
previously requested. Authentication expiry and elapsed-time limits continue to
compare actual instants.

## Bar restoration and Yoga history

The owner confirmed Friday **14:00 to Saturday 14:00**, Berlin time, without an
end date. `scripts/restore-bar-block.ts` prepares exactly that schedule, starting
6 November 2026, for the verified Bar item. It requires an explicit `DATABASE_URL`
and defaults to a read-only dry run. It never loads production dotenv files.
After the release migration, run it without arguments to check conflicts, then
with `--apply` to insert the rule. Repeating the command preserves the existing
rule, exceptions, and stop date; it does not restart a series staff have stopped.
It also refuses to add a second indefinite weekly rule if staff restored one first.

The schedule has been restored in the isolated local database only. The live
database has not been migrated or changed. The read-only live check found no
future Yoga blocks; the old completed Yoga bookings remain as history.

## Release and recovery

The additive `20261106000000_recurring_blocks` migration creates two tables and
does not rewrite bookings, users, or passkeys. Apply it during the verified release
cutover described in [upgrade-release.md](upgrade-release.md). Introduce the Bar
rule only while writes are frozen and the new server is being promoted, because
old server versions cannot enforce it. Once rules are active, an older server
must not accept bookings. Both new and classic calendar layouts on the new server
support these rules; choosing classic is safe.

Rehearse migration and restoration against the isolated backup copy, retain a
fresh restore-tested production backup, and compare users, bookings, and passkey
fingerprints before reopening. Never restore an old dump over subsequent live
bookings. Browser authentication and end-to-end release checks are still required
before deployment.
