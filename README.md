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
| External agent CLI runtimes (Codex, Claude Code, Gemini CLI, …)  | Planned            | Not in scope for A1.1                                     |

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

See [packages/artifact-azure/README.md](./packages/artifact-azure/README.md) for Azurite, semantics, and a Kubernetes example. **Production readiness** still requires OSVA deployment integration and your Azure provisioning review.

## Development

```bash
pnpm verify:a1-1
pnpm verify:a1-2
```

See [CONTRIBUTING.md](./CONTRIBUTING.md), [COMPATIBILITY.md](./COMPATIBILITY.md), and [ENGINEERING_VERIFICATION_PLAYBOOK.md](./ENGINEERING_VERIFICATION_PLAYBOOK.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE).
