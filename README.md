# osva-adapters

Independent open-source infrastructure adapters for [OSVA](https://github.com/Osva-AI/osva).

This repository hosts **external** adapters that implement public OSVA contracts. It is not the OSVA core monorepo. Connectors (API/MCP tools) live in **osva-connectors**; reference workflows live in **osva-examples**.

## Mission

Provide production-oriented and reference implementations of OSVA infrastructure ports so operators can install adapters into deployment images and register them through documented configuration—without forking OSVA core.

## Supported adapters

| Package                                                          | Status             | Description                                               |
| ---------------------------------------------------------------- | ------------------ | --------------------------------------------------------- |
| [`@osva-ai/adapter-artifact-memory`](./packages/artifact-memory) | **A1.1 reference** | Process-local in-memory `ArtifactBlobStore` (non-durable) |
| `@osva-ai/adapter-artifact-azure`                                | Planned            | Durable cloud blob backend                                |
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

## Development

```bash
pnpm verify:a1-1
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [COMPATIBILITY.md](./COMPATIBILITY.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE).
