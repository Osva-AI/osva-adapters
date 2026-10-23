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

| Adapter                                     | Role                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `@osva-ai/adapter-artifact-memory` (A1.1)   | Reference / test double; **process-local, non-durable** |
| Core filesystem / S3 drivers                | Production defaults in OSVA core                        |
| `@osva-ai/adapter-artifact-azure` (planned) | Production-oriented external backend                    |

## Semantics (A1.1 memory)

- **Duplicate keys:** last successful `write` replaces prior bytes (aligned with filesystem adapter overwrite).
- **Missing keys on `open`:** error with `ARTIFACT_UNAVAILABLE`.
- **`delete`:** idempotent; deleting a missing key succeeds.
- **Failures during `write`:** no partial blob visible to subsequent `open`.
- **Reads:** returned buffers/streams are isolated from internal storage.

## Security

Adapters receive opaque keys only. They must not bypass OSVA metadata or workspace checks. Registered modules run in-process with the hosting OSVA process privileges.
