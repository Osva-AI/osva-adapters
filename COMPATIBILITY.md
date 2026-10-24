# Compatibility

## Tested against

| Component                   | Version                 | Notes                                                                                   |
| --------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `@osva-ai/contracts`        | `1.1.0-rc.3` (declared) | Official npm `rc` dist-tag; includes M12.4.3 artifact blob store and registration types |
| OSVA core (reference)       | `1.1.0-rc.3`            | [Osva-AI/osva](https://github.com/Osva-AI/osva) RC3 line (commit `744c1bb` and later)   |
| Node.js                     | `>=24`                  | Matches contracts `engines`                                                             |
| `@osva-ai/sdk`              | `1.1.0-rc.3`            | `@osva-ai/runtime-cli-sidecar` runtime HTTP handler                                     |
| `@osva-ai/runtime-protocol` | `1.1.0-rc.3`            | Runtime Protocol V1 wire schemas for sidecar                                            |

## npm consumption (A1.3)

Adapters depend on the **unmodified** registry package `@osva-ai/contracts@1.1.0-rc.3`. No pnpm patches or vendored contract copies are used in this repository.

Install with the `rc` dist-tag when pinning explicitly:

```bash
npm install @osva-ai/contracts@rc
```

## Adapter semver

`@osva-ai/adapter-artifact-memory` `0.1.x` tracks the reference A1.1 slice. `@osva-ai/adapter-artifact-azure` `0.1.x` tracks the A1.2 slice. Breaking contract changes require a major bump on `@osva-ai/contracts` and a corresponding adapter release.

Packages are versioned **independently** on npm unless a release note documents a coordinated bump.

## npm publication (A1.5 preparation)

| Package                            | Registry status (pre-release audit) | Planned initial version |
| ---------------------------------- | ----------------------------------- | ----------------------- |
| `@osva-ai/adapter-artifact-memory` | Not published (404)                 | `0.1.0`                 |
| `@osva-ai/adapter-artifact-azure`  | Not published (404)                 | `0.1.0`                 |
| `@osva-ai/runtime-cli-sidecar`     | Not published (404)                 | `0.1.0` (A2.1–A2.4 CLI providers) |

Pin adapters with explicit contracts in deployment images:

```bash
npm install @osva-ai/adapter-artifact-azure@0.1.0 @osva-ai/contracts@1.1.0-rc.3
```

Verification before any publish: `pnpm verify:a1-5`. Maintainer steps: [docs/release/MAINTAINER_RELEASE.md](./docs/release/MAINTAINER_RELEASE.md).

**Production notes:** Azurite and A1.4 Docker acceptance validate registered-driver wiring and cross-process behavior against a blob emulator — not sovereign Azure SLAs, private endpoints, or geo-redundant storage. Do not use `@osva-ai/adapter-artifact-memory` for multiprocess production deployments.

## A1.2 Azure dependencies

| Package               | Version (catalog) | Notes                            |
| --------------------- | ----------------- | -------------------------------- |
| `@azure/storage-blob` | `12.28.0`         | Official Azure Blob SDK for Node |

## A1.4 deployment acceptance

| Component             | Version / source                          | Notes                                                                  |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| OSVA deployment image | `v1.1.0-rc.3` git tag                     | GHCR `1.1.0-rc.3` used when manifest exists; else local `docker build` |
| Azurite               | `mcr.microsoft.com/azure-storage/azurite` | Test-only devstore credentials in harness `.env.example`               |
| Acceptance runner     | `scripts/acceptance/a1-4/run.mjs`         | Does not modify OSVA core; evidence → `evidence/latest.json`           |
