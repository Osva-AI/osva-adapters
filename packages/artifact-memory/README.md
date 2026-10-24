# @osva-ai/adapter-artifact-memory

Reference **A1.1** implementation of `ArtifactBlobStore` backed by a process-local JavaScript `Map`.

> **Not production storage.** Bytes are non-durable and isolated to a single Node.js process. **Do not use this adapter for multiprocess production** (web + worker + knowledge-worker will not share bytes). Use OSVA filesystem/S3 drivers or `@osva-ai/adapter-artifact-azure` for durable storage.

## Install

```bash
npm install @osva-ai/adapter-artifact-memory @osva-ai/contracts@rc
```

Requires Node.js `>=24`. This adapter is tested against **`@osva-ai/contracts@1.1.0-rc.3`** from npm.

## Registration

The default export satisfies `RegisteredArtifactBlobStoreModule`:

```typescript
import adapter from "@osva-ai/adapter-artifact-memory";

// OSVA registered loader imports createArtifactBlobStore from operator module specifier.
export const { createArtifactBlobStore } = adapter;
```

Operator configuration (OSVA core):

```bash
export OSVA_ARTIFACT_STORAGE_DRIVER=registered
export OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE="@osva-ai/adapter-artifact-memory"
```

Install the package into the deployment image next to `@osva-ai/contracts@1.1.0-rc.3`. There is no runtime adapter discovery.

## Behavior

- Streaming `write` with incremental `maxBytes` enforcement.
- `sha256:` digest via Node `crypto.createHash("sha256")`.
- Optional `expectedDigest` validation (fail before persist).
- Safe opaque key validation (no `..`, restricted character set).
- Duplicate keys replace prior content; `delete` is idempotent.
- `open` returns isolated buffer copies.

## Errors

Throws `ArtifactBlobStoreError` with `code` from `ARTIFACT_ERROR_CODES` in `@osva-ai/contracts` (for example `ARTIFACT_PAYLOAD_TOO_LARGE`, `ARTIFACT_DIGEST_MISMATCH`, `ARTIFACT_UNAVAILABLE`).

## License

Apache-2.0
