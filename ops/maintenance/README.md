# Static maintenance fallback

This folder contains a bilingual static page and Vercel configuration. There are no
Functions, scripts, packages, forms, external resources, or database calls. The page
does not change bookings or credentials. It does not establish that the live database
is healthy; use the backup and integrity checks in [the migration runbook](../../docs/auth-migration.md).

## Prepare an isolated deployment

Do not deploy the repository root for this fallback. Copy **only** `index.html` and
`vercel.json` into a new empty directory outside this repository. Do not copy `.env*`,
`package.json`, `node_modules`, `.next`, or the application's `.vercel` directory.
Use the Vercel CLI from that directory, linked to the existing GRH project and team.
Confirm the selected project before any deployment.

The deployment root must be this isolated directory, with no additional Root Directory
prefix. Check the project's current Root Directory setting before proceeding; if it is
nonempty, stop and prepare an approved per-deployment override or restore plan instead
of accidentally building another folder. The included configuration sets:

| Setting | Required value |
| --- | --- |
| Framework preset | Other (`framework: null`) |
| Install command | Empty string, explicitly skipped |
| Build command | Empty string, explicitly skipped |
| Development command | Empty string |
| Output directory | `.` |
| Cron definitions | Empty array |

These file settings override the project's Next.js/framework and command settings for
this deployment; do not change the global project build settings. No environment values
are needed. Existing project environment variables may still be inherited: the safety
boundary is the absence of executable code, not an assumption that secrets are absent.
See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

When authorized to rehearse deployment, create an **unaliased production deployment**
from the isolated directory using `vercel deploy --prod --skip-domain`. Do not promote
it until the checks below pass. Record the deployment URL/ID so it can be selected by
`vercel promote <deployment-url>` during an incident; this prepared artifact has never
been production, so do not rely on it appearing in Instant Rollback's history.
See [staged production deployments](https://vercel.com/docs/deployments/promoting-a-deployment).

## Checks before promotion

- Deployment build logs must show no dependency installation, application build, or Prisma
  command. Its resources/output must show **zero Functions and zero Middleware**, and only
  static output. If any executable output appears, do not promote.
- Through an authorized deployment-protection bypass, check `GET` and `HEAD` on `/`,
  `/index.html`, a nested path, and `/api/auth/session`. Require HTTP **503**,
  `Cache-Control: no-store`, `Retry-After: 300`, and `X-Robots-Tag: noindex, nofollow`.
  GET responses must contain the maintenance page; HEAD responses have no body.
  Check POST `/api/trpc/webauthn.login` also returns 503 and never reaches a Function.
- Confirm the page is readable in a fresh browser at narrow/wide widths and that its
  retry link works with a keyboard. A previously installed service worker can still show
  a cached application shell; this static page does not unregister it. Keep the server-side
  mutation freeze active so cached clients cannot write.
- Validate the current database separately and retain the temporary firewall freeze,
  old-deployment protection, and disabled cron state described in the migration runbook.
  A firewall denial or deployment-protection response can precede this page's 503.

After promoting maintenance, **do not restore a database dump** or activate the old
whole-array passkey handlers. Recover by promoting a tested release that understands
both credential stores, verify preserved writes, then reopen traffic and re-enable cron.

The configuration requests 503/no-store/noindex for all paths, including API paths.
Local schema validation is not a Vercel routing rehearsal. This artifact has not been
deployed, and platform headers, routing, promotion, and database-preserving recovery must
still be verified in the isolated rehearsal before it is an operational rollback target.
