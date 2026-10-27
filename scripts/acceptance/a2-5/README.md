# A2.5 — OSVA worker + CLI sidecar deployment acceptance

Cross-process acceptance: **OSVA v1.1.0-rc.4** worker → **REMOTE_HTTP** → **`@osva-ai/runtime-cli-sidecar`** → fixture-backed Gemini / Codex / Claude CLIs.

## Prerequisites

- Docker Compose v2
- Node.js 24+
- pnpm 12+
- Network access to clone or pull `Osva-AI/osva@v1.1.0-rc.4` (or set `OSVA_RC4_SOURCE`)

## Quick start

```bash
cp scripts/acceptance/a2-5/docker/.env.example scripts/acceptance/a2-5/docker/.env
pnpm test:acceptance:a2-5
```

## Environment

| Variable                             | Description                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `OSVA_RC4_SOURCE`                    | Local checkout of OSVA RC4 (skips ephemeral clone; legacy `OSVA_RC3_SOURCE` accepted) |
| `OSVA_A25_SKIP_DOCKER=1`             | Skip Docker (audit-only; no E2E)                                                      |
| `OSVA_A25_SKIP_BASE_BUILD=1`         | Reuse local `osva:1.1.0-rc.4-a25-base` image                                          |
| `OSVA_SIDECAR_CLI_PROVIDER`          | Sidecar provider for initial boot (`fixture` default)                                 |
| `OSVA_A25_KEEP_COMPOSE_ON_FAILURE=1` | Leave Compose up after failure (local diagnosis)                                      |

## Worker capability bind (RC4)

Multi-container acceptance sets `OSVA_RUNTIME_CAPABILITY_HOST=0.0.0.0` so peers reach `http://worker:44995`. OSVA RC4 requires **`OSVA_RUNTIME_CAPABILITY_ALLOW_PUBLIC_BIND=true`** in Compose (harness-only opt-in; see `docker/compose.yml`).

## Failure diagnosis

On failure, sanitized diagnostics are written to `scripts/acceptance/a2-5/evidence/docker-failure-diagnostics.json` before teardown (unless keep-on-failure is set).

## Worker SSRF / private network

The worker must allow the sidecar URL on the Compose network:

```yaml
OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS: "true"
```

Do **not** disable OSVA SSRF protections globally. Scope allowlisting to the sidecar subnet in production.

## Evidence

Machine-readable results: `scripts/acceptance/a2-5/evidence/latest.json` (gitignored).

Schema: [evidence-schema.json](./evidence-schema.json).

## Design

See [docs/acceptance/A2_5_INTEGRATION_DESIGN.md](../../docs/acceptance/A2_5_INTEGRATION_DESIGN.md).
