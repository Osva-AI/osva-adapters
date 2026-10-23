# Artifact adapters

## Contract

Adapters implement `ArtifactBlobStore` from `@osva-ai/contracts`:

- `write(input)` — stream content, enforce `maxBytes`, return `sizeBytes` and `sha256:` digest.
- `open(key)` — return size and a readable content stream.
- `delete(key)` — remove stored bytes for the opaque key.

Metadata, workspace authorization, and idempotency remain in OSVA PostgreSQL via core services.

## Registration

Export `createArtifactBlobStore(config)` matching `RegisteredArtifactBlobStoreModule`. Core loads the module specifier from operator configuration (`ArtifactStorageConfigRegistered.registerModule`).

## Reference vs production

| Adapter                                   | Role                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `@osva-ai/adapter-artifact-memory` (A1.1) | Reference / test double; **process-local, non-durable** |
| Core filesystem / S3 drivers              | Production defaults in OSVA core                        |
| `@osva-ai/adapter-artifact-azure` (A1.2)  | Durable Azure Blob backend (operator env credentials)   |

## Semantics (shared across A1.1 / A1.2)

- **Duplicate keys:** last successful `write` replaces prior bytes (aligned with OSVA core filesystem/S3 overwrite).
- **Missing keys on `open`:** error with `ARTIFACT_UNAVAILABLE`.
- **`delete`:** idempotent; deleting a missing key succeeds.
- **Failures during `write`:** no partial blob visible to subsequent `open` (A1.2 uses staging blob + copy).
- **Reads:** returned streams are independent per `open` call.
- **Digests:** SHA-256 with `sha256:` prefix; optional `expectedDigest` enforced before commit.

## Semantics (A1.1 memory)

Process-local `Map` storage; bytes are not durable and are not shared across processes.

## Semantics (A1.2 Azure)

- Credentials from operator environment variables only (connection string or account name + key); optional custom blob endpoint for Azurite/private endpoints.
- Upload uses a pending object suffix (`.__osva_pending.<uuid>`) and server-side copy to the final key.
- Copy completion must report `success` before `write` returns; digest/size describe the staged bytes copied to the destination.
- Staging object cleanup is best-effort in `finally` and targets only that write’s pending key (UUID suffix).
- `createArtifactBlobStore` applies `ArtifactStorageConfigRegistered.maxBytes` as an upper bound on each `write` (`min(request, registered)`).
- Concurrent writes to the same key are **not** serialized; the last successful copy wins (Azure last-writer-wins). Failed copies do not replace an already committed object.
- Streaming uploads use a fixed buffer size (4 MiB) to bound memory.
- Azure error text is sanitized before surfacing to callers.

## Security

Adapters receive opaque keys only. They must not bypass OSVA metadata or workspace checks. Registered modules run in-process with the hosting OSVA process privileges.
