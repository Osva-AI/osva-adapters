# Compatibility

## Tested against

| Component                             | Version                | Notes                                                                                                                          |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@osva-ai/contracts`                  | **`1.1.4`** (declared) | Public npm **`latest`** / **`stable-candidate`**; M19 adapter dependency line                                                  |
| `@osva-ai/sdk`                        | **`1.1.4`**            | `@osva-ai/runtime-cli-sidecar` runtime HTTP handler                                                                            |
| `@osva-ai/runtime-protocol`           | **`1.1.4`**            | Runtime Protocol V1 wire schemas for sidecar                                                                                   |
| **OSVA platform (GitHub)**            | **`1.1.1`** (`v1.1.1`) | Latest [Osva-AI/osva](https://github.com/Osva-AI/osva) release tag — **not** the same semver as npm `@osva-ai/contracts@1.1.4` |
| **OSVA worker (A1.4 / A2.5 harness)** | **`v1.1.0-rc.4`**      | Docker Compose acceptance builds/pulls this tag when present; harness **not re-run** for M19 PR prep (2026-11-05)              |
| Node.js                               | `>=24`                 | Matches contracts `engines`                                                                                                    |

### npm vs platform

- **Adapters in this repo** compile and test against registry packages at **`1.1.4`** only (no pnpm patches).
- **OSVA deployment images** you run in production may track platform **`1.1.1`** (or another tag) while npm contracts stay at **`1.1.4`** — pin both explicitly in images.
- The npm **`rc`** dist-tag still resolves to **`1.1.0-rc.4`**; do **not** use `@rc` for new installs.

## M19 verification scope (2026-11-05)

| Gate                                                  | Status on branch prep                 |
| ----------------------------------------------------- | ------------------------------------- |
| Lint / typecheck / unit tests (all packages)          | **Executed**                          |
| A1.1 / A1.2 / A2.1 / A2.2–4 pack consumers            | **Executed**                          |
| A1.5 release-readiness (pack + external npm consumer) | **Executed**                          |
| A2.6 release-readiness (without `--require-a25`)      | **Executed** (pack, audit, unit only) |
| **A1.4** Docker deployment acceptance                 | **Not executed** (this PR prep)       |
| **A2.5** Docker worker + sidecar acceptance           | **Not executed** (this PR prep)       |

Strict sidecar publication readiness (`pnpm test:release-readiness:a2-6`, which passes **`--require-a25`**) remains a **maintainer / CI Docker** gate, not claimed for this branch prep.

## npm consumption (M19)

Adapters depend on the **unmodified** registry package `@osva-ai/contracts@1.1.4`.

```bash
npm install @osva-ai/contracts@1.1.4
# or
npm install @osva-ai/contracts@stable-candidate
```

## Adapter semver

`@osva-ai/adapter-artifact-memory` `0.1.x` tracks the reference A1.1 slice. `@osva-ai/adapter-artifact-azure` `0.1.x` tracks the A1.2 slice. Breaking contract changes require a major bump on `@osva-ai/contracts` and a corresponding adapter release.

Packages are versioned **independently** on npm unless a release note documents a coordinated bump.

## npm publication

| Package                            | Registry (checked **2026-11-05**) | Version in this repo (M19)               |
| ---------------------------------- | --------------------------------- | ---------------------------------------- |
| `@osva-ai/adapter-artifact-memory` | Published **`0.1.0`**             | **`0.1.2`** (`@osva-ai/contracts@1.1.4`) |
| `@osva-ai/adapter-artifact-azure`  | Published **`0.1.0`**             | **`0.1.2`** (`@osva-ai/contracts@1.1.4`) |
| `@osva-ai/runtime-cli-sidecar`     | **404** (never published)         | **`0.1.0`**                              |

Pin adapters with explicit contracts in deployment images:

```bash
npm install @osva-ai/adapter-artifact-azure@0.1.2 @osva-ai/contracts@1.1.4
```

Prepublish checks (no Docker): `pnpm verify:a1-5` (artifact adapters), `pnpm verify:a2-2-4` (sidecar pack consumer). Maintainer steps: [docs/release/MAINTAINER_RELEASE.md](./docs/release/MAINTAINER_RELEASE.md).

**Production notes:** Azurite and **when run** A1.4 Docker acceptance validate registered-driver wiring against an emulator — not sovereign Azure SLAs. Do not use `@osva-ai/adapter-artifact-memory` for multiprocess production deployments.

## A1.2 Azure dependencies

| Package               | Version (catalog) | Notes                            |
| --------------------- | ----------------- | -------------------------------- |
| `@azure/storage-blob` | `12.28.0`         | Official Azure Blob SDK for Node |

## A1.4 / A2.5 deployment acceptance (optional gates)

| Component                           | Version / source                                  | Notes                                                           |
| ----------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| OSVA worker image (harness default) | `v1.1.0-rc.4`                                     | GHCR `1.1.0-rc.4` or local `docker build` from that tag         |
| Packed adapter under test           | `@osva-ai/contracts@1.1.4`                        | Tarball from this repo (`0.1.2` artifact adapters)              |
| OSVA platform reference             | `v1.1.1` on GitHub                                | Operators may deploy **1.1.1** while adapters pin npm **1.1.4** |
| Runners                             | `scripts/acceptance/a1-4/run.mjs`, `a2-5/run.mjs` | Require Docker; evidence → `evidence/latest.json`               |

## Runtime CLI sidecar distribution (M19.5)

| Path                               | Status                 | Notes                                                                                                                          |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Standalone npm package**         | **Selected (primary)** | `exports`, `bin` `osva-runtime-cli-sidecar`, deps on `@osva-ai/sdk` / `@osva-ai/runtime-protocol` / `@osva-ai/contracts@1.1.4` |
| **OCI image (operator-built)**     | Secondary              | `packages/runtime-cli-sidecar/Dockerfile`; not pushed from CI                                                                  |
| **Packaged executable (pkg/nexe)** | Not selected           | npm + bin is the supported consumer path                                                                                       |

See [packages/runtime-cli-sidecar/README.md](./packages/runtime-cli-sidecar/README.md).
