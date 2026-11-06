# Public problem and feedback reports

The **Report a problem** control is part of the actual site header on desktop and mobile, for residents, rental staff, administrators, and signed-out visitors. The brief update notice is separate: dismissing it removes the notice while leaving the header control available. Notice dismissal is scoped to the release and account (or the signed-out browser).

Every signed-in account can use the public reporting dialog. Signed-out visitors first see private support through the existing in-app Contact page, plus a sign-in option for public reports. Contact navigation also works from non-home and missing-page routes. The existing rental email is a secondary fallback if the contact page cannot open. Session-loading state disables report opening. Account changes reset only the dialog host and its in-memory draft, preserving the current page state. No report text is saved in browser storage. The sign-in handoff keeps keyboard focus inside the authentication dialog and returns it to the header control when that dialog closes.

Public reports send only the report type, title and description the user writes to the **public** repository `cakirmert/GRH-Rental-Services`. The unchecked consent box must be selected for every new submission. The dialog directs private, account, booking and security concerns to existing private contact/chat channels. There are no automatic screenshots, URLs, console logs, device details, account names, email addresses, booking data or app-version metadata. A user can still put personal information in their own text, so the public disclosure matters.

The GitHub issue body renders authored lines as plain text to prevent active images, HTML, mentions and Markdown injection. The issue title neutralizes mentions and formatting. An opaque, randomly generated report marker supports recovery; it is not a user/account identifier.

## Configuration and deployment

Apply `20261106030000_problem_reports` and generate the Prisma client before this code receives traffic. This migration only adds the queue and its cascading User relation; it does not rewrite existing accounts, bookings or passkeys.

In the **Vercel Production environment only**, set:

```text
GITHUB_REPORTS_ENABLED=true
GITHUB_ISSUES_TOKEN=<fine-grained token>
```

Create a fine-grained token scoped only to `cakirmert/GRH-Rental-Services`, with repository **Issues: read and write** (plus GitHub's mandatory metadata read permission). It needs no repository contents, administration, workflow, organization or other repository access. Choose a short operationally manageable expiration, record its renewal date privately, and rotate it by replacing the Production variable and redeploying. Revoke the old token after verifying the replacement. Never use a `NEXT_PUBLIC_` variable, commit a token, copy the local GitHub CLI OAuth credential, or include it in logs or test fixtures. GitHub documents the required permission and create/list endpoints in [its Issues REST API reference](https://docs.github.com/en/rest/issues/issues?apiVersion=2026-03-10).

Delivery also requires `NODE_ENV=production`, `VERCEL=1`, `VERCEL_ENV=production`, no nonproduction `VERCEL_TARGET_ENV`, a remote HTTPS `ORIGIN`, and a remote DNS PostgreSQL host. Only `sslmode`, `channel_binding` and `uselibpqcompat` DB URL query options are accepted by the delivery guard; host overrides are rejected. `DISABLE_OUTBOUND=true` or `GRH_LOCAL_TEST=true` always disables delivery. The local runner explicitly clears the token and disables the integration. Missing configuration, local execution and preview deployments can save reports, but cannot contact GitHub. The response remains **queued**, never falsely “published.”

No deployed behavior or real GitHub delivery is established by the local tests. Enabling the variables alone does not deploy this candidate. Production verification should use an explicitly authorized, harmless report after deployment; mock tests do not create a public issue.

## API contract

`problemReports.submit` is an authenticated tRPC mutation:

```ts
{
  requestId: string // UUID; preserve across retries of the same submission
  category: "problem" | "feedback"
  title: string // 5–120 characters after trimming; raw maximum 120
  description: string // 20–4000 characters after trimming; raw maximum 4000
  publicPostingConsent: true
}
// Result:
{ id: string, status: "queued" | "published" | "needs_review", issueUrl: string | null }
```

Unknown fields and invalid input are rejected. No user ID, repository or destination URL can be supplied. Account existence, idempotency lookup, durable rate admission and creation share one transaction. The queue commits before any external request. The limits are five new reports per account and 100 new reports globally, each using a 24-hour budget window beginning with its first admitted request. An identical retry uses the existing row and consumes no additional budget. A changed payload under the same request ID returns `CONFLICT`; the frontend keeps failed submissions immutable so a network retry cannot accidentally create a second report. Idempotency lasts as long as the local record is retained.

`problemReports.deliverySummary` requires a fresh ADMIN role and returns only `{ queued, published, needsReview, oldestQueuedAt }`. It exposes no author identity or report content. An administrator can view the authenticated JSON response at `/api/trpc/problemReports.deliverySummary`; ordinary users and stale demoted sessions are denied. Counts exclude expired rows and include in-flight sends as queued. This gives administrators visibility even when the GitHub credential is absent or expired.

## Durable delivery and recovery

Submission makes one best-effort delivery attempt. Both existing protected cron routes also drain eligible reports, at most 50 candidates and approximately 35 seconds of work per invocation. Requests are serialized with a PostgreSQL lock and separated by at least one second. A report is claimed with a compare-and-swap lease; concurrent workers cannot both create it. Each delivery has an 8-second total external-request deadline, and each response is streamed with a 2 MiB cap. Workers never log submitted text, account identifiers, tokens or raw GitHub responses. Cron logs contain aggregate attempt/skip counts only.

Known rate-limit and configuration rejections are deferred with bounded attempts and a persistent cooldown; rate-limit headers are respected. GitHub's [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) explain serial requests and retry timing.

GitHub does not document a create-issue idempotency key. A timeout, unexpected response, failed result persistence, or stale in-flight lease therefore **must not trigger another automatic POST**. The report becomes `NEEDS_REVIEW`. The worker lists repository issues in all states and looks for the exact final marker `<!-- grh-report:REPORT_ID -->`, with at most five pages of 100 issues each. A match records the issue number. No match remains under review and is checked again later; a missing match is not evidence that no issue was created. This favors avoiding duplicate public issues over silently retrying an uncertain write.

For operator review, first check the aggregate endpoint. An authorized maintainer can inspect individual `NEEDS_REVIEW` rows in the database's private administration interface; do not export the results or paste report text in logs, terminals, tickets or this repository. A read-only diagnostic query is:

```sql
SELECT "id", "category", "title", "description", "createdAt", "expiresAt",
       "deliveryAttempts", "lastErrorCode", "issueNumber"
FROM "ProblemReport"
WHERE "status" = 'NEEDS_REVIEW' AND "expiresAt" > CURRENT_TIMESTAMP
ORDER BY "createdAt" ASC
LIMIT 50;
```

Match the report's exact marker against the public repository, including closed issues; search indexing may lag. The automatic reconciliation cap can miss a very old issue among a busy repository's later issues. If an issue is found, verify the number belongs to this repository and mark the row published through a carefully scoped maintenance transaction, clearing its lease. If it cannot be found, leave the uncertain row under review: **do not bulk reset `NEEDS_REVIEW` to `QUEUED`**. Any manual recreation is a separate deliberate public-posting action with duplicate risk. Definitive `GITHUB_CONFIGURATION` failures should prompt credential/permission repair; reports with an exhausted retry count need explicit operator review after repair. No operator mutation is performed by these instructions or by the automated local tests.

## Retention and account deletion

Every local report expires 30 days after creation, including undelivered and under-review reports. Expired rows are excluded from delivery and summaries immediately, then removed in bounded batches by the evening cron. This retention also removes the idempotency record; retrying a request ID after its record is purged is a new submission. Monitor the admin counts and review failures before expiry; an undelivered expired report is not forwarded later.

Deleting an account cascades all its local report payloads and queue entries. The worker rechecks the row just before sending. It cannot recall an external HTTP request already in flight when account deletion occurs, and the public GitHub issue is an external copy that remains until a maintainer removes it. Account deletion and the 30-day local expiry do not delete published GitHub issues, delivered notifications, or existing database backups. The consent disclosure explains the public copy and directs users to keep private information out of reports.

## Verification

Before the header placement follow-up, the candidate passed 634 tests across 80 files, TypeScript, lint and
a production build on 6 November 2026. The report-specific focused run passed
66 backend/cron checks, including eight real PostgreSQL tests; the feedback
interface then passed 17 interaction tests. These overlap the full suite totals.
The header/guest follow-up passes 26 focused UI tests, including real-header
entry points for every role and guests, session loading, account/draft isolation,
notice dismissal, non-home contact navigation, keyboard navigation, and focus
transfer to and from the real authentication dialog.
Static full-page previews use real page, header, and footer components with
synthetic account and booking data; they check layout rather than live authentication
or delivery to GitHub.

Unit tests cover authentication, literal public consent, raw and trimmed limits, role checks, local/preview/outbound gates, PostgreSQL host override aliases, inert Markdown rendering, bounded responses, global cooldown admission, safe retries and ambiguous outcomes. Isolated PostgreSQL fixtures verify concurrent submission idempotency and budgets, competing-worker single delivery, multi-report queue draining, timeout reconciliation without a second POST, account deletion cascades, expired-row cleanup and preservation of a concurrently renewed AuthState row. Network calls are mocked and fixture cleanup is scoped to synthetic rows; the original restored data is not purged.
