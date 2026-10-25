# A2.5 — OSVA worker + CLI sidecar deployment acceptance

Cross-process acceptance: **OSVA v1.1.0-rc.3** worker → **REMOTE_HTTP** → **`@osva-ai/runtime-cli-sidecar`** → fixture-backed Gemini / Codex / Claude CLIs.

## Prerequisites

- Docker Compose v2
- Node.js 24+
- pnpm 12+
- Network access to clone or pull `Osva-AI/osva@v1.1.0-rc.3` (or set `OSVA_RC3_SOURCE`)

## Quick start

```bash
cp scripts/acceptance/a2-5/docker/.env.example scripts/acceptance/a2-5/docker/.env
pnpm test:acceptance:a2-5
```

## Environment

| Variable | Description |
| -------- | ----------- |
| `OSVA_RC3_SOURCE` | Local checkout of OSVA RC3 (skips ephemeral clone) |
| `OSVA_A25_SKIP_DOCKER=1` | Skip Docker (audit-only; no E2E) |
| `OSVA_A25_SKIP_BASE_BUILD=1` | Reuse local `osva:1.1.0-rc.3-a25-base` image |
| `OSVA_SIDECAR_CLI_PROVIDER` | Sidecar provider for initial boot (`fixture` default) |

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
