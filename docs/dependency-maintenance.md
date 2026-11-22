# Dependency maintenance

`package.json` describes supported ranges and the runtime engine;
`package-lock.json` records the validated installed graph. Use `npm ci` rather
than forcing incompatible peers.

## Automated checks

The repository's Dependabot configuration checks weekly on Sunday in the
configured Berlin timezone. Keep `@trpc/client`, `@trpc/react-query` and
`@trpc/server` pinned to the same release because they declare exact peer
versions. Dependabot groups tRPC updates in dedicated pull requests. Other
routine minor and patch updates share a group, with major updates reviewed
separately. Security updates run independently of the weekly schedule.
Updates are merged manually.

The **Dependency install** pull request check runs a clean `npm ci` on Linux
with the repository's Node version. It checks the lockfile and peer dependencies
with install scripts disabled. The Vercel preview runs Prisma generation and
the application build.

Enable repository secret scanning, push protection and dependency alerts where
supported. Configuration files do not prove those account-level settings are
enabled; verify them through the repository's administration tools.

## Update review

1. Read official release notes and check runtime/peer compatibility.
2. Review aliases and overrides before replacing them.
3. Run the applicable tests, type checks, lint and production build.
4. Exercise affected browser workflows, especially auth, bookings and migrations.
5. Recheck the installed dependency audit after the lockfile changes.
6. Close superseded update requests only after verifying the new graph covers them.

Dependency advisories do not establish application exploitability, and a clean
audit does not prove the absence of application vulnerabilities.

Optional scheduled issue/security reports are operator tooling. Their account
identifiers, model settings and execution evidence belong in private records;
issue text must be treated as untrusted input and must never authorize commands,
data changes, merges or deployments.

References: [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference),
[security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates).
