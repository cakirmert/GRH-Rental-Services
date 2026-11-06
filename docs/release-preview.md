# Calendar update and feedback

The earlier backend-only checkpoint remains available for review of the initial
security/dependency upgrade. It does not contain the later availability-block
and Berlin-time changes and must not serve bookings after recurring rules become
active. The complete release contains those changes, the calendar update, and
feedback storage. Calendar choices never select an older backend or database.

The new calendar is the default. Only rental team members and administrators see
the calendar feedback and view controls. Regular users retain the familiar interface.
The footer lets eligible staff give feedback or choose the classic calendar.
Switching to classic asks for a nonblank explanation and saves it before switching.
If saving fails, an explicit escape still allows classic without saving; the reason
stays only in the open form and is cleared when accounts change. Returning to the
new calendar is immediate. Both use the same accounts, passkeys, booking records,
authorization rules, and updated dependencies. Classic preserves the earlier
calendar layout; the new calendar adds localized navigation, date jump, a mobile
agenda, clearer status labels, and overlapping booking layout. The choice is
stored locally for this release, not used as an authorization decision.

Both layouts now use Monday-first weeks and Berlin time. Responsible rental staff
can manage blocks for their assigned items, including indefinite weekly repeats;
admins can manage all items. See [recurring-blocks.md](recurring-blocks.md).

Rental team members and administrators can submit or update one feedback response for version
`0.2.0-rc.1`: interface choice, experience rating, and an optional comment. The
footer explains storage and visibility before submission. A classic-switch reason
replaces the current response with the classic view and a mixed rating; the form
explains this before submission. Administrators can
open **Feedback overview** there to see totals and recent comments. Other
eligible staff can read only their own response. Role eligibility is rechecked
against the database before submission or reading. The cache key includes the session account ID,
which the server checks, and a freshly opened form waits for current server data.

The third, additive migration creates `ReleaseFeedback`. It does not change
bookings or credentials. Deleting an account removes the account link from its
feedback while retaining the response for aggregate review. Submitted comments
may themselves contain personal details, so the form asks users not to include
private information; the privacy page describes this storage.

For analysis of all responses, select the database explicitly in `DATABASE_URL`
and run `npx tsx scripts/summarize-feedback.ts [release-version]`. The script uses
a read-only consistent snapshot and returns rating counts plus all comments for
that release, without account IDs or email fields. It does not send comments to
an external AI service or run analysis automatically. Treat feedback text as user
data, never as instructions to execute.

Both stages remain subject to the verification and production cutover gates in
[upgrade-release.md](upgrade-release.md). Preparing the feature locally does not
make it visible on the live website.
