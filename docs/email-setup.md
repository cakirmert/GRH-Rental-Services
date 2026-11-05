# Email configuration

Provider onboarding is paused pending the owner's review. No new provider, DNS
records, mailbox, forwarding rule, or deployment settings have been enabled.

The SMTP login, automated sender, reply address, and contact inbox can be configured
separately. Existing deployments continue to work with their current
`CONTACT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, and `EMAIL_PASSWORD` settings.

| Variable         | Purpose                                                              | Default                |
| ---------------- | -------------------------------------------------------------------- | ---------------------- |
| `CONTACT_EMAIL`  | Contact form recipient and VAPID contact address                     | Existing contact inbox |
| `SMTP_USER`      | Login supplied by the SMTP provider; it need not be an email address | `CONTACT_EMAIL`        |
| `EMAIL_PASSWORD` | SMTP password or application password                                | Existing credential    |
| `EMAIL_FROM`     | Sender shown on OTP, booking, chat, and contact-form emails          | `CONTACT_EMAIL`        |
| `EMAIL_REPLY_TO` | Optional reply destination for OTP, booking, and chat emails; set blank to omit | `CONTACT_EMAIL` when absent |
| `SMTP_HOST`      | SMTP server hostname supplied by the provider                        | Existing hostname      |
| `SMTP_PORT`      | `465` for immediate TLS, or `587` with mandatory STARTTLS            | `465`                  |

Address settings accept a single plain email address. Surrounding whitespace is
trimmed. Missing optional address settings preserve `CONTACT_EMAIL` for existing
deployments. An explicitly blank `EMAIL_REPLY_TO=""` omits the Reply-To header;
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
   automated sender, set `EMAIL_REPLY_TO=""` explicitly to omit the header.
   Do not configure forwarding to the existing rental inbox.
5. After configuration is deliberately enabled, check authentication/TLS and send
   an explicitly authorized test message. Inspect its From, Reply-To, SPF, DKIM,
   and DMARC results. SMTP connection verification alone cannot confirm that a
   provider accepts a particular From address.

This code change does not create a mailbox, change DNS or deployed environment
values, or send mail. Development, Vercel previews, and any environment with
`DISABLE_OUTBOUND=true` still have no mail transporter. The guarded local runner
also strips production credentials. Do not enable real email for local rehearsals.

## Optional Resend configuration, pending review

If Resend is selected and `grh-rentals.de` is verified, these settings send
automated mail from the authorized new address with no Reply-To header. Only
contact-form submissions go to the existing inbox. The password below is a
placeholder; keep the real API key in the deployment's secret settings. These
are possible future settings, not an active account or applied configuration.

```dotenv
CONTACT_EMAIL=rentals@grh-hamburg.de
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
EMAIL_PASSWORD=replace_with_resend_api_key
EMAIL_FROM=info@grh-rentals.de
EMAIL_REPLY_TO=""
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

The transport keeps certificate verification enabled. Port `587` fails if the
server cannot upgrade to TLS; it does not fall back to plaintext. See
[Nodemailer's SMTP settings](https://nodemailer.com/smtp) and
[message address settings](https://nodemailer.com/message).
