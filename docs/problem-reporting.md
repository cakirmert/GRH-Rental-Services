# Public problem reporting

The header offers problem/feedback reporting to all visitors. Signed-out users
can sign in to report or use private contact. Private account, booking or
security concerns should use contact/chat rather than a public issue.

## Consent and storage

Only the category, title and description deliberately entered by the user are
submitted for public issue posting, with explicit unchecked consent for each
new report. Account details, screenshots, logs and browser metadata are not
attached automatically.

The authenticated mutation validates length and allowed fields, binds the
submission to the current account, and preserves a request ID across retries.
The app commits the durable queue entry before attempting external delivery.
App copies expire after 30 days or account deletion; external issues remain
until separately removed.

## Integration

Production issue delivery requires `GITHUB_REPORTS_ENABLED=true` and a
`GITHUB_ISSUES_TOKEN` restricted to Issues read/write for the server-configured
repository. Keep the credential server-only, record its expiry privately and
redeploy after rotation. No repository-content or administration access is needed.

Local tests, previews and disabled-outbound environments can save reports but
cannot publish issues. The interface distinguishes queued, published and
review-needed outcomes.

## Retry and review

Delivery uses database coordination and bounded requests. A timeout or uncertain
write does not trigger a blind second issue creation; reconciliation searches
for the report's opaque marker. An unresolved outcome remains under review.

Administrators can inspect aggregate delivery status through the protected
delivery-summary operation. Review individual report contents only through
authorized private tools. Do not paste submitted text or account identifiers
into public release documentation.

For testing, mock network delivery and use isolated PostgreSQL fixtures. A live
delivery check needs a harmless, explicitly authorized report.
