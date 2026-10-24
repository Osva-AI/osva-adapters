# A1.4 — OSVA deployment acceptance (Azure adapter + Azurite)

Reproducible **cross-process** acceptance for `@osva-ai/adapter-artifact-azure` against **OSVA `v1.1.0-rc.3`** (`744c1bb…`), using a **packed local adapter tarball** (not a source copy) and a **shared Azurite** backend.

## Prerequisites

- Docker Compose v2
- Node.js 24+, pnpm 12 (this repository)
- ~8 GB disk for an OSVA RC3 image build (when GHCR `1.1.0-rc.3` is unavailable)
- Optional: `OSVA_RC3_SOURCE` pointing at a checkout of [Osva-AI/osva](https://github.com/Osva-AI/osva) at tag `v1.1.0-rc.3`

## Quick run

```bash
cp scripts/acceptance/a1-4/docker/.env.example scripts/acceptance/a1-4/docker/.env
node scripts/acceptance/a1-4/run.mjs
```

Evidence is written to `scripts/acceptance/a1-4/evidence/latest.json`.

## What it proves

| #   | Scenario                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `@osva-ai/adapter-artifact-azure` resolves from **independent** `pnpm pack` install in the deployment image |
| 2   | **Web** multipart upload + content download + `Digest` header                                               |
| 3   | **Worker** remote run artifact → **web** `GET /v1/artifacts/:id/content`                                    |
| 4   | **Knowledge worker** ingests a source artifact → extracted artifact bytes via web                           |
| 5   | **Restart** web/worker/knowledge-worker → same Azurite bytes                                                |
| 6   | Missing npm module → startup failure (fail closed)                                                          |
| 7   | Invalid Azure connection → startup failure (no filesystem fallback)                                         |
| 8   | Azurite account key not present in service logs                                                             |
| 9   | SHA-256 digest integrity on web readback                                                                    |
| 10  | `docker compose down -v` cleanup                                                                            |

## Deployment model

1. **Base image:** `ghcr.io/osva-ai/osva:1.1.0-rc.3` when published; otherwise `docker build` from `OSVA_RC3_SOURCE` / ephemeral clone at `v1.1.0-rc.3`.
2. **Derived image:** `Dockerfile.osva-with-azure-adapter` unpacks the packed adapter into `/app/node_modules/@osva-ai/adapter-artifact-azure` (no pnpm workspace root mutation) so dynamic `import()` from `@osva/adapters-artifact-storage` resolves the operator module.
3. **Compose project** `osva-a14` uses host port **18080** (web) and **11000** (Azurite) by default — isolated from a default OSVA dev stack on 8080/10000.

## Worker capability URL (Compose only)

Remote HTTP agents call back into the worker capability server. In multi-container Compose, set:

```bash
OSVA_RUNTIME_CAPABILITY_HOST=0.0.0.0
OSVA_RUNTIME_CAPABILITY_PORT=44995
OSVA_RUNTIME_CAPABILITY_BASE_URL=http://worker:44995
```

so sidecars such as the acceptance `fake-runtime` reach the worker on the Docker network (not `127.0.0.1` inside another container).

## Operator configuration (production-shaped)

```bash
OSVA_ARTIFACT_STORAGE_DRIVER=registered
OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE="@osva-ai/adapter-artifact-azure"
OSVA_ARTIFACT_AZURE_CONTAINER=<existing-container>
OSVA_ARTIFACT_AZURE_CONNECTION_STRING=<secret>
# or account name + key (+ optional OSVA_ARTIFACT_AZURE_BLOB_ENDPOINT)
```

Install the adapter into the **same** deployment image filesystem as OSVA (`/app/node_modules` for official images). OSVA does not download adapters at runtime.

## Security and limitations

- **Trusted operator** supplies module specifier and image contents; no HTTP-driven plugin loading.
- **Test-only** Azurite credentials in `.env.example`; never use devstore keys in production.
- **Registered adapters run in-process** with full process privileges (OSVA M12.4.x model).
- **Real Azure** acceptance is out of scope here; use the same env vars against a provisioned storage account in your environment.
- **RC3 GHCR tag** may trail npm `@osva-ai/contracts@1.1.0-rc.3`; this harness builds from the git tag when the OCI manifest is missing.

## Manual compose (debug)

```bash
cd scripts/acceptance/a1-4/docker
docker compose --env-file .env up -d --wait
docker compose --profile bootstrap run --rm bootstrap
# API on http://127.0.0.1:18080
docker compose down -v
```

Module resolution probe (matches OSVA entrypoint cwd):

```bash
docker compose exec -w /app/apps/web/dist web node /acceptance/probe-module-resolution.mjs
```
