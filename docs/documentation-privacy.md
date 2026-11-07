# Public documentation and private operations

Public guides should let a new developer understand, run and maintain the
application using example configuration and synthetic data.

Keep these details outside Git:

- Credentials, tokens, connection strings, recovery codes and verification links.
- Customer or staff information, private booking details and live data counts.
- Backup files, their locations, row fingerprints and recovery verification logs.
- Live deployment identifiers, provider resource identifiers and access-control
  inventories that are useful only to operators.
- Mailbox handover details, account ownership decisions and private screenshots.

Use placeholders such as `info@example.org` and `preview.example.org`. Keep the
real values in the hosting provider's secret settings and the operator's private
runbook. Public screenshots must use synthetic private records.

`docs/private/`, `private-docs/` and `ops/private/` are ignored as an additional
guard. Prefer storing operational records outside the checkout altogether.
Ignoring a path does not remove previously committed contents.

## Previously published material

An ordinary cleanup commit removes content from the current tree while leaving
earlier commits readable. A path-limited Git history rewrite can remove the
folder from retained branches and tags, then reintroduce reviewed public guides.

That rewrite preserves unrelated file contents and can retain commit messages,
authors and dates, but changes commit identifiers from the first affected commit
onward. It also affects pull requests, signatures and other clones. Make and
verify an offline recovery bundle, rehearse in a disposable clone, and agree the
affected refs before publishing a rewrite.

Rewriting Git cannot retract copies in existing clones or forks. GitHub may also
retain pull-request references and cached views. Treat exposed credentials as
compromised and rotate them rather than relying on a rewrite.

See [GitHub's removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
