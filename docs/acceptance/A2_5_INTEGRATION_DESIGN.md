# A2.5 — CLI sidecar deployment acceptance design

## Goal

Prove **real OSVA worker** execution over **REMOTE_HTTP** → **Runtime Protocol V1** → **`@osva-ai/runtime-cli-sidecar`** → **deterministic CLI fixtures** (Gemini / Codex / Claude shaped), including RunAttempt persistence and security negative paths.

This extends the A1.4 Compose pattern (Postgres, Valkey, web, worker, knowledge-worker, scheduler, Azurite + registered Azure artifact adapter) without modifying OSVA core.

## Topology

```text
[Host] acceptance runner (Node 24)
    |
    v
Docker Compose project `osva-a25`
  postgres, valkey, azurite (+ init)
  migrate, web, worker, knowledge-worker, scheduler, workflow-orchestrator
  cli-sidecar  (HTTP :9321, private network)
       ^
       | POST /execute (Runtime Protocol V1)
       |
  worker (RemoteHttpRuntimeAdapter)
```

## Operator-controlled configuration

| Layer          | Variable                                       | Purpose                                                                            |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Worker         | `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` | Allow `http://cli-sidecar:9321/execute` (RFC1918 / Docker DNS)                     |
| Worker         | `OSVA_RUNTIME_CAPABILITY_*`                    | Short-lived capability tokens for protocol (unchanged from A1.4)                   |
| Sidecar        | `OSVA_SIDECAR_CLI_PROVIDER`                    | `fixture` \| `gemini` \| `codex` \| `claude`                                       |
| Sidecar        | `OSVA_SIDECAR_*_BINARY` + entrypoint wrapper   | Points vendor providers at packed fixture scripts (no live vendor APIs)            |
| Sidecar        | `OSVA_SIDECAR_WORKSPACE_ROOT`                  | Isolated volume for CLI cwd                                                        |
| Sidecar        | `OSVA_SIDECAR_AUTH_SECRET`                     | Optional Bearer auth on `/execute` (hermetic tests + optional deployment scenario) |
| Agent manifest | `runtime.endpoint`                             | Must match sidecar URL on Compose network                                          |
| Artifacts      | A1.4 Azure registered driver                   | Cross-process artifact persistence for RunAttempt output                           |

SSRF protections in OSVA core remain enabled; acceptance does **not** disable them globally—only the documented private-network allow flag for the sidecar subnet.

## Harness entrypoint

- `scripts/acceptance/a2-5/run.mjs` — builds OSVA RC3 image (GHCR or local), packs adapters, starts Compose, runs scenarios, writes evidence.
- Evidence: `scripts/acceptance/a2-5/evidence/latest.json` (gitignored).

## Verification

```bash
pnpm test:acceptance:a2-5          # Docker required
pnpm verify:a2-5                   # sidecar unit tests + pack consumer + optional Docker
OSVA_A25_SKIP_DOCKER=1 pnpm test:acceptance:a2-5   # audit-only (no E2E)
```

## Trust boundary

One sidecar instance = one trust boundary. Bearer auth is **not** tenant isolation. Production should use network policy, separate credentials, and non-root OCI images per provider cell.
