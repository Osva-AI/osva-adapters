# A1.5 release readiness acceptance

Repeatable **prepublication** verification for `@osva-ai/adapter-artifact-memory` and `@osva-ai/adapter-artifact-azure`. This does **not** publish to npm or rebuild the full OSVA core deployment image.

## Prerequisites

- Node.js `>=24`, pnpm `12.x`
- Docker (for Azure external consumer smoke and Azurite integration in CI)
- Network access to npm (official `@osva-ai/contracts@1.1.0-rc.3` tarball)

## Run

From repository root:

```bash
pnpm verify:a1-5
```

Or directly:

```bash
node scripts/acceptance/a1-5/release-readiness.mjs
```

Skip Azure Docker steps (memory-only / no Docker):

```bash
node scripts/acceptance/a1-5/release-readiness.mjs --skip-azure-docker
```

Publish workflow uses **`prepublish-package.mjs`** for the selected package only (pack inspect + registration export). Full dual-package checks remain in this script and CI.

## What it checks

1. Build both adapter packages.
2. `pnpm pack` each package and inspect tarball contents and dependency specifiers (no `catalog:` / `workspace:`, no `src/` or `test/` leaks).
3. Resolve `createArtifactBlobStore` and `registeredArtifactBlobStoreModule` from a clean `npm install` of the tarball.
4. Run A1.1 / A1.2 external pack-consumer scripts (registry contracts + smoke).
5. Emit a sanitized JSON report on stdout and `evidence/latest.json` (gitignored).

## Higher-level gate (A1.4)

Cross-process OSVA web/worker/knowledge-worker deployment acceptance remains separate:

```bash
node scripts/acceptance/a1-4/run.mjs
```

Azurite success there does **not** prove real Azure Storage production readiness.
