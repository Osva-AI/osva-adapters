# @osva-ai/adapter-artifact-azure

**A1.2** implementation of `ArtifactBlobStore` backed by [Azure Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/).

> **Deployment integration required.** This package is verified with unit mocks, Azurite, and an external pack consumer. End-to-end production readiness depends on OSVA core registering the adapter in your deployment image and passing M12.4.x acceptance in your environment.

## Registration

Install into the OSVA deployment image alongside `@osva-ai/contracts`, then use the `registered` artifact storage driver:

```bash
export OSVA_ARTIFACT_STORAGE_DRIVER=registered
export OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE="@osva-ai/adapter-artifact-azure"
```

The default export satisfies `RegisteredArtifactBlobStoreModule` (`createArtifactBlobStore`).

## Operator configuration

Credentials and container settings are read from the **environment at factory time**. There are no embedded production credentials and no runtime discovery of adapter packages.

| Variable                                                                                                                                        | Required | Description                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `OSVA_ARTIFACT_AZURE_CONTAINER`                                                                                                                 | Yes      | Existing blob container name (lowercase, 3–63 characters).                                   |
| `OSVA_ARTIFACT_AZURE_CONNECTION_STRING`                                                                                                         | One of   | Azure Storage connection string.                                                             |
| `OSVA_ARTIFACT_AZURE_ACCOUNT_NAME`                                                                                                              | One of   | Storage account name (with account key below).                                               |
| `OSVA_ARTIFACT_AZURE_ACCOUNT_KEY`                                                                                                               | One of   | Storage account key.                                                                         |
| `OSVA_ARTIFACT_AZURE_BLOB_ENDPOINT`                                                                                                             | No       | Custom blob endpoint (Azurite, private link, sovereign cloud). Used with account name + key. |
| Set **either** `OSVA_ARTIFACT_AZURE_CONNECTION_STRING` **or** `OSVA_ARTIFACT_AZURE_ACCOUNT_NAME` + `OSVA_ARTIFACT_AZURE_ACCOUNT_KEY`, not both. |

Per-request size limits come from OSVA via `ArtifactBlobWriteInput.maxBytes` (aligned with `ArtifactStorageConfigRegistered.maxBytes`).

## Deployment example (Kubernetes)

```yaml
env:
  - name: OSVA_ARTIFACT_STORAGE_DRIVER
    value: registered
  - name: OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE
    value: "@osva-ai/adapter-artifact-azure"
  - name: OSVA_ARTIFACT_AZURE_CONTAINER
    value: osva-artifacts
  - name: OSVA_ARTIFACT_AZURE_CONNECTION_STRING
    valueFrom:
      secretKeyRef:
        name: osva-azure-storage
        key: connection-string
```

Provision the container and IAM outside OSVA (Terraform, Bicep, Azure Portal). OSVA core retains metadata, authorization, and workspace isolation in PostgreSQL.

## Semantics

Aligned with [artifact adapter architecture](../../docs/architecture/ARTIFACT_ADAPTERS.md) and A1.1 reference behavior:

- **Writes** stage to a pending blob, verify SHA-256 (and optional `expectedDigest`), then copy into the final key so failed uploads are not visible via `open`.
- **Overwrite:** last successful `write` replaces prior bytes.
- **Missing `open`:** `ARTIFACT_UNAVAILABLE`.
- **`delete`:** idempotent (`deleteIfExists`).
- **Streaming:** bounded upload buffer (4 MiB); digest computed while streaming.
- **Errors:** Azure messages are sanitized before surfacing (no account keys or signatures in logs/errors).

## Local development (Azurite)

```bash
docker compose -f packages/artifact-azure/docker-compose.azurite.yml up -d
export OSVA_ARTIFACT_AZURE_INTEGRATION=1
export OSVA_ARTIFACT_AZURE_CONTAINER=osva-artifacts-dev
export OSVA_ARTIFACT_AZURE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
pnpm --filter @osva-ai/adapter-artifact-azure test:integration
```

## Errors

Throws `ArtifactBlobStoreError` with `code` from `ARTIFACT_ERROR_CODES` in `@osva-ai/contracts`.
