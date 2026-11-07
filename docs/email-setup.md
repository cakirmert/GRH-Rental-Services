# Email configuration

Incoming mailboxes and application sending are separate services. A mailbox plan
may allow browser-based email without offering authenticated SMTP for an app.
Choose and verify both capabilities before changing DNS or the sender.

## Application variables

| Variable | Purpose | Fallback |
| --- | --- | --- |
| `CONTACT_EMAIL` | Contact-form recipient and push contact | Required for delivery |
| `SMTP_HOST` | Sending provider's SMTP hostname | Provider configuration |
| `SMTP_PORT` | `465` for TLS or `587` for mandatory STARTTLS | `465` |
| `SMTP_USER` | SMTP login, which may differ from the sender | `CONTACT_EMAIL` |
| `EMAIL_PASSWORD` | SMTP password or limited sending API key | Provider credential |
| `EMAIL_FROM` | Automated sender | `CONTACT_EMAIL` |
| `EMAIL_REPLY_TO` | Optional automated reply destination | `CONTACT_EMAIL` when absent; `none` or blank omits the header |

Mailbox settings accept a single plain address. Display-name lists and embedded
headers are rejected. Keep the public contact constant in
`src/constants/contact.ts` aligned with the production recipient.

A provider-neutral example:

```dotenv
CONTACT_EMAIL=info@example.org
SMTP_HOST=smtp.example.org
SMTP_PORT=465
SMTP_USER=provider_login
EMAIL_PASSWORD=replace_with_a_scoped_secret
EMAIL_FROM=info@example.org
EMAIL_REPLY_TO=none
```

For Resend SMTP, use its documented host and the login `resend`, with a key
restricted to sending for the verified domain. Keep real values in Production-only
secret settings. Use the provider's [SMTP guide](https://resend.com/docs/send-with-smtp)
and [current limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits).

## DNS and receiving

Apply the provider's exact verification, DKIM and bounce-domain records.
Maintain a single SPF record combining the legitimate senders. Preserve website
DNS. Change incoming MX only after the destination mailbox is provisioned and
receiving has been verified; retain the old mailbox during DNS propagation.

Keep domain, mailbox ownership, recovery contacts, credential locations and DNS
change evidence in the private operations runbook. Mailbox login passwords are
separate from the app's SMTP/API credential. Staff should use direct mailbox
access rather than the registrar owner's account.

An email address does not itself grant a website role. Provision privileged
website access as a separate, explicitly authorized operation. Anyone who can
read a mailbox can receive its website sign-in codes.

## Message behavior and metrics

Automated sign-in, booking and chat messages say not to reply and link to the app.
Omitting Reply-To does not disable an email client's Reply button. Internal
contact-form mail goes to `CONTACT_EMAIL`, using the validated submitter as
Reply-To; authenticated submissions use the current account address.

Use delivery/failure logs for transactional mail. Open/click tracking is disabled;
a custom tracking hostname alone does not guarantee better delivery. Any later
tracking change requires a reviewed privacy notice and link validation. See
[Resend's tracking guidance](https://resend.com/docs/dashboard/domains/tracking).

Delivered mailbox copies and provider records have separate retention from the
application database. Check the provider's current policy; do not infer mailbox
deletion from account deletion.

## Verification

Verify SMTP/TLS and send a labelled synthetic message using the real template.
Confirm actual receipt, From/Reply-To and domain authentication. Test receiving
and a contact-form message separately. Saved deployment settings only affect a
new artifact.

Development, hosted previews and `DISABLE_OUTBOUND=true` have no mail
transporter. Keep production mail credentials out of local test environments.
