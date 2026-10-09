# dot office dashboard

A seven-seat task dashboard with a Three.js office, accessible task cards, freshness-aware activity, light/dark themes, and browser-local seat customization.

This repository is a sanitized source export. Its example tasks are entirely fictional. It contains no real task history, account settings, credentials, production deployment bindings, or update schedules. The original private deployment is not changed by this export.

## Quick start

Requires Node.js 24 or newer and npm.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm start
```

Open `http://127.0.0.1:4173`. The preview listens on loopback only. `PORT=4174 npm start` selects a different port. Stop it with Ctrl+C.

The default build is a read-only demo: `/api/snapshot` returns `initial-snapshot.json`; mutations return HTTP 405. Even if a database happens to be present, demo mode never reads it. Sample observations have fixed historical dates, so the UI correctly marks them as stale. The test suite supplies synthetic recent times to exercise active office states. Refresh reads saved data; it does not run an agent or invent progress.

## Features

- Seven fixed presentation seats, not a claim about execution capacity
- Volumetric WebGL office and a labeled 2D compatibility fallback
- Accessible HTML task cards and native dialogs alongside the scene
- Full-orbit drag controls, cursor-centered wheel zoom, right-drag/keyboard pan, and touch pinch/pan
- Furnished day/night studio, procedural wood and screen textures, cutaway walls, and responsive layouts
- Themes, reduced-motion support, and browser-local names/model choices
- Explicit observation age, cached/offline status, and revision checks
- Separate requested versus verified model/effort metadata
- Versioned snapshots, optimistic concurrency, and idempotent writes in private mode

## Structure

- `public/`: HTML, CSS, UI state, office renderer, character images, locally bundled Three.js
- `worker/index.js`: portable Fetch-handler entry point and safe deployment modes
- `worker/authorization.js`: default-deny authorization adapter
- `worker/storage.js`: D1-compatible prepared SQL and compare-and-swap persistence
- `worker/validate.js`, `data.schema.json`: bounded snapshot contract
- `db/`, `drizzle/`: database schema and initial migration
- `initial-snapshot.json`: fictional data only
- `scripts/build.mjs`: validates sample data and builds `dist/server/`
- `scripts/serve.mjs`: loopback-only demo preview
- `test/`: Node tests for UI, geometry, rendering state, API, validation, and storage

The frontend makes same-origin snapshot requests every 15 seconds while visible. It stops decorative motion on stale observations, transport failure, hidden pages, or reduced-motion settings. It does not contact a runtime service, infer task capacity, or create background jobs. Dates are displayed in UTC+08:00; this is an interface convention, not a user-location claim.

## Private backend integration

The write path is retained, but authentication from any previous hosting platform is deliberately not copied or assumed. Ordinary hosting does not inherit an owner's private session boundary. A real private deployment needs a verified identity/authorization adapter and its own database. This repository does not provide a turnkey identity provider.

1. Implement a server-only `authorize(request, env, scope)` function for your trusted host/session provider. Verify session or JWT signature, issuer, audience, expiry, and the principal's authorization as appropriate. Return exactly `true` only for the requested `read` or `write` scope. A read grant does not grant writes.
2. Pass that adapter to `createWorker({ authorize })` from your own entry point. The exported default uses `denyAll`; selecting private mode without replacing it denies access. Never change it to an unconditional allow function in a real deployment.
3. Set `DASHBOARD_MODE=private` and `DASHBOARD_ORIGIN` to the exact canonical HTTPS origin, without a path or trailing slash. `deployment.example.json` documents the non-secret values.
4. Bind a D1-compatible database as `DB`, using a newly provisioned database that you are authorized to use. Apply the SQL migration in `drizzle/`. Provisioning is a separate operator action, not performed by build or preview. If you use Drizzle to maintain the schema, `npm run db:generate` generates migration files; review them before applying them.
5. Protect all routes. Private mode calls the adapter for reads before serving assets or accessing the database, and separately for writes before accepting a mutation. Configure rate limits and request deadlines at your hosting boundary.
6. Read `/api/snapshot`, reconcile the current revision and actual observation times, then PUT `{ "expectedRevision": 0, "snapshot": { ... } }` with `Content-Type: application/json` and `X-Dashboard-Update: 1`, using your adapter's authorized session. Same-origin/CSRF checks and the custom header are additional defenses, not authentication.
7. Read back after a write. On 409, read and reconcile again. On an uncertain network result, read before retrying. Never invent observations or overwrite a newer task state.

Unknown modes or invalid private-origin configuration fail closed. Unauthorized reads return 401; missing write permission returns 403. A failing identity service returns 503. Writes use a 64 KiB streaming body limit and strict field allowlists. All SQL data values are bound parameters.

Store secrets only in your hosting provider's secret facility. Nothing named in `deployment.example.json` is a password or token. Never commit real snapshots or secret configuration. The example configuration is documentation, not an automatic deployment manifest. Sites projects, authentication, database resources, and schedules do not transfer between accounts just because this source is copied.

## Build and verification

`npm run check` builds the worker and runs the complete automated suite. `npm ci --ignore-scripts` uses the committed lockfile without dependency lifecycle scripts. The build uses esbuild's build API, never its development server, and creates a self-hosted pinned Three.js bundle with its upstream license. Runtime assets require no CDN.

Tests include stable seats, dialog recovery, safe text rendering, local settings, model provenance, stale/future observations, transport failures, 3D geometry, chair clearance, renderer lifecycle, private-mode authorization, body limits, schema rejection, and database revision behavior. GPU-free geometry tests are not a substitute for rendered cross-browser visual QA.

## Data and security

Read [SECURITY.md](SECURITY.md) before connecting real data. Schema validation is not a privacy classifier: valid text fields can still contain confidential information. Apply an explicit data-selection/redaction policy before writing a snapshot. Do not place private data in `initial-snapshot.json`, because build output contains that file's contents.

## Artwork and licensing

Character illustrations and their Dots-inspired 3D counterparts are retained at the owner's explicit request. They are third-party official-character imagery, not original open-license artwork of this repository. Public availability of this repository does not grant a license to use those characters. The exact redistribution license for those assets has not been independently verified. No official affiliation or endorsement is claimed.

See [ASSET_NOTICES.md](ASSET_NOTICES.md) and the included [Three.js MIT license](public/vendor/three-LICENSE.txt). No blanket open-source license has been selected for the project's own code or artwork. Third-party licenses remain in force for their respective components; do not assume the whole repository is MIT-licensed.
