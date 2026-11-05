# Optional release preview

The rollout has two stages. First, deploy the verified security/dependency/backend
upgrade with the familiar interface. After that is stable, publish the optional
interface preview and its feedback storage. The preview switch never selects an
older backend or database.

Classic is the default. The footer lets each browser opt into the release preview
and return to Classic at any time. Both use the same accounts, passkeys, booking
records, authorization rules, and updated dependencies. Classic preserves the
earlier calendar layout; Preview adds localized navigation, date jump, a mobile
agenda, clearer status labels, and overlapping booking layout. The choice is
stored locally for this release, not used as an authorization decision.

Signed-in users can submit or update one feedback response for version
`0.2.0-rc.1`: interface choice, experience rating, and an optional comment. The
footer explains storage and visibility before submission. Administrators can
open **Feedback overview** there to see totals and recent comments. Other users
can read only their own response. The cache key includes the session account ID,
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
