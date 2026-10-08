# Security model

## Safe default

The default entry point is a fictional, read-only demo. It ignores `env.DB` and rejects all snapshot mutations. It contains no built-in credentials, user accounts, automatic task discovery, or external update job.

Private mode is an integration surface. Every route requires a verified read authorization result; writes additionally require a separate write authorization result. The shipped adapter always denies. An unknown mode, invalid HTTPS origin, failed adapter, or missing database never becomes an unauthenticated fallback to real data.

Do not substitute an Origin comparison, custom header, browser secret, or an unconditional `true` function for identity verification. Configure trusted-host request timeouts, rate limits, session protections, HTTPS, and appropriate response caching before using real data. Verify the complete authentication path on the intended host.

## Data safeguards

- Snapshot payloads have explicit field allowlists, type/length limits and a streaming 64 KiB request cap.
- Database writes use prepared statements, expected-revision compare-and-swap and stale observation rejection.
- Identical writes do not increment the revision. Network uncertainty requires a read before retry.
- The UI renders task text with DOM text APIs, not HTML interpolation.
- Scene appearance is selected from an allowlist. No model/file uploads or arbitrary asset URLs are exposed.
- Themes and seat preferences are stored only in the current browser.
- Build parses and validates fixture JSON before serializing it into a JavaScript module and rejects asset symlinks.

These defenses do not detect all private content. Even a valid task title may be confidential. Export only authorized user-facing facts, omit unrelated metadata, and review every snapshot before sharing its audience. Never commit real task snapshots, traces, database exports, credentials, deployment IDs, or private operational notes.

## Dependencies and testing limits

Dependencies are pinned in `package-lock.json`, with npm registry URLs and integrity hashes. Three.js is bundled locally with its MIT notice. esbuild is used only through its build API. The Drizzle development dependency tree includes an older esbuild for tooling; the application does not run that dependency's serve feature. Keep tooling patched before introducing any development-server exposure.

Automated tests do not constitute a penetration test or guarantee that a custom identity adapter is correct. Authentication and infrastructure supplied by an operator are outside this repository's tested default. No CI/deployment credentials are required by the shipped code.

If you identify a security issue, contact the repository maintainer privately through a verified channel. Do not post credentials or real user data in a public issue.
