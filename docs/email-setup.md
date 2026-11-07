# Email configuration

## Prepared domain-mail release — 7 November 2026

The owner chose a separate rental inbox, with no forwarding to the former rental
address. Public contact links use `info@grh-rentals.de`, defined once in
`src/constants/contact.ts`; keep the deployed `CONTACT_EMAIL` aligned with it.

Resend has verified `grh-rentals.de` in Ireland (`eu-west-1`). Its API key has
Sending access restricted to this domain, and is saved as a Production-only
Vercel Secret in `EMAIL_PASSWORD`. SMTP authentication and a labelled sample
booking confirmation from `info@grh-rentals.de` were tested; arrival was confirmed
in the owner's requested Outlook mailbox. No booking was created. Resend's domain
configuration requires TLS when delivering mail. Open/click tracking remains off
pending the owner's metrics choice; ordinary delivery/failure logs are available.

Production mail settings are prepared for the next deliberate deployment. The
running 1.18.1 artifact retains its previous STRATO configuration until promotion;
changing saved environment settings does not change an existing deployment.
The previous SMTP settings and new key are retained in separate ignored local
files for recovery. Never copy production mail credentials into the guarded
local test environment or commit them.

An existing free Dynadot `info@grh-rentals.de` mailbox was activated, with its
incoming MX, SPF and DKIM records added while preserving website DNS. It is the
current receiving endpoint during setup. The requested final arrangement is:

| Address | Purpose | Access |
| --- | --- | --- |
| `info@grh-rentals.de` | Rental questions, suggestions, complaints and contact-form messages | Rental team |
| `admin@grh-rentals.de` | Private service administration and ownership mail | Owner/superadmin |

An internal receiving test was delivered and observed in the Dynadot `info`
inbox. This does not provision the requested second mailbox.

Dynadot's Free plan supports only one address. Zoho's EU Free plan supports up to
five separate mailboxes, using its webmail or mobile apps. Its account signup is
pending the owner completing password, phone verification and terms acceptance.
Do not claim the admin mailbox exists or change the receiving MX until both
mailboxes have been provisioned and receiving has been tested. Keep the old
Dynadot mailbox during the transition so mail sent using cached MX records is
retained. This mailbox setup does not rename website accounts or grant new
website roles.

Mailbox login passwords are separate from the app's Resend sending key. Give the
rental team access only to its `info` mailbox, not the registrar, Vercel, Resend
owner account or private administration inbox. Record the final mailbox login
URL and usernames after provisioning; passwords must be set privately.

For the owner, the current temporary inbox is available through
[Dynadot My Emails](https://www.dynadot.com/account/email/list.html) → Sign In.
Do not share the registrar login with the rental team. Once the two Zoho
mailboxes are provisioned in the EU account, their intended webmail entry is
[Zoho Mail](https://mail.zoho.eu), using each complete address as its username.
The administration mailbox is not yet provisioned at this checkpoint.

The SMTP login, automated sender, reply address, and contact inbox can be configured
separately. Existing deployments continue to work with their current
`CONTACT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, and `EMAIL_PASSWORD` settings.

| Variable         | Purpose                                                              | Default                |
| ---------------- | -------------------------------------------------------------------- | ---------------------- |
| `CONTACT_EMAIL`  | Contact form recipient and VAPID contact address                     | Existing contact inbox |
| `SMTP_USER`      | Login supplied by the SMTP provider; it need not be an email address | `CONTACT_EMAIL`        |
| `EMAIL_PASSWORD` | SMTP password or application password                                | Existing credential    |
| `EMAIL_FROM`     | Sender shown on OTP, booking, chat, and contact-form emails          | `CONTACT_EMAIL`        |
| `EMAIL_REPLY_TO` | Optional reply destination for OTP, booking, and chat emails; `none` or blank omits it | `CONTACT_EMAIL` when absent |
| `SMTP_HOST`      | SMTP server hostname supplied by the provider                        | Existing hostname      |
| `SMTP_PORT`      | `465` for immediate TLS, or `587` with mandatory STARTTLS            | `465`                  |

Address settings accept a single plain email address. Surrounding whitespace is
trimmed. Missing optional address settings preserve `CONTACT_EMAIL` for existing
deployments. `EMAIL_REPLY_TO=none` or an explicitly blank `EMAIL_REPLY_TO=""` omits the Reply-To header;
it does not forward replies to the contact inbox. Blank `EMAIL_FROM` and invalid
nonblank address settings fall back to `CONTACT_EMAIL`. Display names,
comma-separated lists, and embedded headers are not accepted. Missing
configuration does not cause an import-time build failure.

Automated OTP, booking, and chat messages say not to reply and direct people to
the app's booking chat. Chat notifications link directly to the relevant chat;
other messages link to the app. No Telegram contact is invented or published.
Omitting Reply-To does not disable an email client's Reply button: it normally
targets the From address instead. This setup does not create an incoming mailbox.
Internal contact-form notifications still go to `CONTACT_EMAIL`, with the
validated submitter address as Reply-To so staff can respond to that person.

To use `info@grh-rentals.de` for automated mail:

1. Confirm that the chosen provider supports authenticated SMTP sending from that
   address or a verified domain. A forwarding address or an email-hosting entry
   by itself does not establish outbound sending capability.
2. Apply the provider's exact domain verification, SPF, DKIM, and any required MX
   records. Outbound services may use a separate bounce subdomain; do not replace
   the domain's incoming-mail MX records unless receiving mail is also moving.
   Create a receiving mailbox only if this address should receive mail. Review
   DMARC alignment using the provider's guidance. Do not invent DNS values or add
   a second SPF record.
3. Set `SMTP_USER` and `EMAIL_PASSWORD` to that provider's credentials, with its
   `SMTP_HOST` and supported port. Set `EMAIL_FROM=info@grh-rentals.de` only after
   the provider authorizes that sender. Merely changing `EMAIL_FROM` does not
   grant the existing SMTP login permission to send as another domain.
4. Keep `CONTACT_EMAIL` as the internal contact-form inbox. For the planned
   automated sender, set `EMAIL_REPLY_TO=none` explicitly to omit the header.
   The named value works in Vercel's editor, which rejects empty values.
   Forwarding is a separate receiving choice; confirm the owner's selected
   destination before enabling it. It does not authorize outbound app sending.
5. After configuration is deliberately enabled, check authentication/TLS and send
   an explicitly authorized test message. Inspect its From, Reply-To, SPF, DKIM,
   and DMARC results. SMTP connection verification alone cannot confirm that a
   provider accepts a particular From address.

Development, Vercel previews, and any environment with
`DISABLE_OUTBOUND=true` still have no mail transporter. The guarded local runner
also strips production credentials. Do not enable real email for local rehearsals.

## Resend SMTP configuration

The prepared settings send automated mail from the verified new address with no
Reply-To header. Contact-form notifications go to the separate rental inbox and
use the submitter's address for replies. The password below is a placeholder;
keep the real domain-limited key in the deployment's secret settings.

```dotenv
CONTACT_EMAIL=info@grh-rentals.de
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
EMAIL_PASSWORD=replace_with_resend_api_key
EMAIL_FROM=info@grh-rentals.de
EMAIL_REPLY_TO=none
```

Resend requires an API key and a verified sending domain for this setup. Port
`587` is also supported with mandatory STARTTLS in this application. Follow
[Resend's SMTP instructions](https://resend.com/docs/send-with-smtp) and keep the
account on the Free plan without enabling paid overages.

The Free plan currently permits 100 transactional emails per UTC day and 3,000
per month. Each recipient counts separately; received emails also use the quota.
OTP, booking, chat, and contact notifications share this allowance. Check
[Resend's account limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
before enabling delivery.

Receiving at Dynadot or Zoho does not consume Resend's inbound quota. Keep
Resend's receiving capability disabled when a separate mailbox host handles MX.
Its Free plan advertises 30-day retention of email records; mailbox contents and
already-delivered recipient copies have separate retention. See
[data retention](data-retention.md).

Resend recommends reserving open tracking for marketing domains rather than
authentication/booking messages. A custom link hostname is required for tracked
links; it does not by itself guarantee better deliverability. If tracking is
enabled later, update the public privacy notice and recheck the resulting links.
See [Resend's tracking guidance](https://resend.com/docs/dashboard/domains/tracking).

The transport keeps certificate verification enabled. Port `587` fails if the
server cannot upgrade to TLS; it does not fall back to plaintext. See
[Nodemailer's SMTP settings](https://nodemailer.com/smtp) and
[message address settings](https://nodemailer.com/message).
