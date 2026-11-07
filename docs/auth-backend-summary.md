# Authentication and backend design

| Area | Current design |
| --- | --- |
| Sign-in | Auth.js sessions with email-code recovery and SimpleWebAuthn passkeys. |
| Authentication state | Short-lived, hashed or random database state with expiry, atomic consumption and shared rate budgets. |
| Passkey compatibility | Normalized credential indexes coexist with retained legacy data; existing credentials do not require reenrollment. |
| Authorization | Protected operations read the current account role and relevant item responsibilities from the database. |
| Account switching | Query caches, drafts and delayed results are scoped to account identity and permissions. |
| Booking availability | Shared server policy checks capacity and recurring blocks within serializable transactions. |
| Retention | Eligible regular accounts are automatic; inactive staff require manual review. Linked deletion is transactional. |
| Problem reports | A durable queue requires explicit public-posting consent and separates local storage from external issue delivery. |
| Side effects | Booking/admin policies are separated from transport and notification effects. |

The main boundaries are `src/server/modules`, feature controllers in
`src/features`, and shared policies/helpers. Keep authorization and availability
decisions on the server even when the interface already restricts an action.

Framework/library upgrades are compatibility work; an upgrade alone does not
establish that an earlier version was exploitable. Dependency audits and
application reviews cover different risks.

Booking notifications currently attempt delivery immediately. They do not have
the durable outbox used by public problem reports; consider that distinction
when changing delivery guarantees.

See the [migration contract](auth-migration.md), [retention policy](data-retention.md)
and [release procedure](upgrade-release.md). Private assessment reports and live
verification evidence are maintained separately from these public guides.
