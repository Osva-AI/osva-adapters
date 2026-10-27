# osva-adapters

Independent open-source infrastructure adapters for [OSVA](https://github.com/Osva-AI/osva).

This repository hosts **external** adapters that implement public OSVA contracts. It is not the OSVA core monorepo. Connectors (API/MCP tools) live in **osva-connectors**; reference workflows live in **osva-examples**.

## Mission

Provide production-oriented and reference implementations of OSVA infrastructure ports so operators can install adapters into deployment images and register them through documented configuration—without forking OSVA core.

## Supported adapters

| Package                                                          | Status             | Description                                               |
| ---------------------------------------------------------------- | ------------------ | --------------------------------------------------------- |
| [`@osva-ai/adapter-artifact-memory`](./packages/artifact-memory) | **A1.1 reference** | Process-local in-memory `ArtifactBlobStore` (non-durable) |
| [`@osva-ai/adapter-artifact-azure`](./packages/artifact-azure)   | **A1.2**           | Azure Blob Storage backend (operator credentials)         |
| [`@osva-ai/runtime-cli-sidecar`](./packages/runtime-cli-sidecar) | **A2.1–A2.4**      | Runtime Protocol V1 sidecar + Gemini / Codex / Claude CLI |

Both artifact adapters are published on npm (`0.1.0` initial; **`0.1.1`** pins `@osva-ai/contracts@1.1.0-rc.4` for A3). Publication is manual via GitHub Actions ([maintainer guide](./docs/release/MAINTAINER_RELEASE.md)).

Gemini CLI, Codex CLI, and Claude Code backends ship in `@osva-ai/runtime-cli-sidecar` (select via `OSVA_SIDECAR_CLI_PROVIDER`). Live vendor credentials are operator-managed; default CI uses hermetic CLI fixtures.

## Quickstart (A1.1 memory reference)

```bash
pnpm install
pnpm --filter @osva-ai/adapter-artifact-memory build
```

Register with OSVA using the `registered` artifact storage driver (operator-controlled):

```bash
export OSVA_ARTIFACT_STORAGE_DRIVER=registered
export OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE="@osva-ai/adapter-artifact-memory"
```

Install `@osva-ai/adapter-artifact-memory` into the deployment image alongside `@osva-ai/contracts`. See [packages/artifact-memory/README.md](./packages/artifact-memory/README.md) for semantics and limitations.

## Quickstart (A1.2 Azure)

```bash
pnpm install
pnpm --filter @osva-ai/adapter-artifact-azure build
```

Register with OSVA (operator-controlled credentials via environment variables):

```bash
export OSVA_ARTIFACT_STORAGE_DRIVER=registered
export OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE="@osva-ai/adapter-artifact-azure"
export OSVA_ARTIFACT_AZURE_CONTAINER=your-container
export OSVA_ARTIFACT_AZURE_CONNECTION_STRING="..."
```

See [packages/artifact-azure/README.md](./packages/artifact-azure/README.md) for Azurite, semantics, and a Kubernetes example.

## Deployment acceptance (A1.4)

Cross-process OSVA + Azurite Compose harness (packed adapter install, web/worker/knowledge-worker):

```bash
node scripts/acceptance/a1-4/run.mjs
```

See [scripts/acceptance/a1-4/README.md](./scripts/acceptance/a1-4/README.md) and [docs/acceptance/A1_4_INTEGRATION_DESIGN.md](./docs/acceptance/A1_4_INTEGRATION_DESIGN.md).

## Release readiness (A1.5)

Prepublication verification (pack, tarball inspect, external npm consumer, registration exports):

```bash
pnpm verify:a1-5
```

Does not publish to npm. See [scripts/acceptance/a1-5/README.md](./scripts/acceptance/a1-5/README.md).

## Development

```bash
pnpm verify:a1-1
pnpm verify:a1-2
pnpm verify:a1-5
pnpm verify:a2-1
# Docker + OSVA RC4 source required:
pnpm verify:a1-4
```

Adapters declare **`@osva-ai/contracts@1.1.0-rc.4`** from npm (official `rc` dist-tag; no patched contracts).

See [CONTRIBUTING.md](./CONTRIBUTING.md), [COMPATIBILITY.md](./COMPATIBILITY.md), and [ENGINEERING_VERIFICATION_PLAYBOOK.md](./ENGINEERING_VERIFICATION_PLAYBOOK.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE).
