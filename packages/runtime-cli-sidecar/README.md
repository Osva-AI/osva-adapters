# @osva-ai/runtime-cli-sidecar

Vendor-neutral HTTP sidecar for running CLI-based agent runtimes through **OSVA Runtime Protocol V1**.

Includes **Gemini CLI**, **Codex CLI**, and **Claude Code** providers (A2.2–A2.4) plus the A2.1 deterministic fixture for tests.

## Install

```bash
npm install @osva-ai/runtime-cli-sidecar @osva-ai/sdk@1.1.0-rc.4 @osva-ai/runtime-protocol@1.1.0-rc.4 @osva-ai/contracts@1.1.0-rc.4
```

## Run

```bash
export OSVA_SIDECAR_CLI_PROVIDER=fixture   # or gemini | codex | claude
export OSVA_SIDECAR_HOST=127.0.0.1
export OSVA_SIDECAR_PORT=9321
export OSVA_SIDECAR_WORKSPACE_ROOT=/tmp/osva-cli-workspace
# Vendor auth (operator env, not HTTP): GEMINI_API_KEY / CODEX_API_KEY / ANTHROPIC_API_KEY
osva-runtime-cli-sidecar
```

## Programmatic use

```typescript
import {
  createCliSidecar,
  createCliProviderFromSidecarConfig,
  loadSidecarConfigFromEnv,
} from "@osva-ai/runtime-cli-sidecar";

const config = loadSidecarConfigFromEnv();
const provider = createCliProviderFromSidecarConfig(config);
const sidecar = createCliSidecar({ provider, config });
await sidecar.listen();
```

## Run input (vendor providers)

```json
{
  "prompt": "Summarize README.md",
  "cwd": ".",
  "deadlineMs": 120000
}
```

The sidecar maps CLI structured output to protocol success payloads with `provider` + `response` fields.

## Protocol

- `POST /execute` — Runtime Protocol V1 (via `@osva-ai/sdk/runtime` handler)
- `GET /health/live` — process up
- `GET /health/ready` — accepting work (503 while draining)

## Configuration (environment)

| Variable                           | Default     | Description                                        |
| ---------------------------------- | ----------- | -------------------------------------------------- |
| `OSVA_SIDECAR_CLI_PROVIDER`        | `fixture`   | `fixture`, `gemini`, `codex`, `claude`             |
| `OSVA_SIDECAR_GEMINI_BINARY`       | `gemini`    | Allowlisted Gemini binary                          |
| `OSVA_SIDECAR_CODEX_BINARY`        | `codex`     | Allowlisted Codex binary                           |
| `OSVA_SIDECAR_CLAUDE_BINARY`       | `claude`    | Allowlisted Claude binary                          |
| `OSVA_SIDECAR_HOST`                | `127.0.0.1` | Bind host                                          |
| `OSVA_SIDECAR_PORT`                | `9321`      | Bind port                                          |
| `OSVA_SIDECAR_AUTH_SECRET`         | unset       | Optional Bearer auth for `/execute`                |
| `OSVA_SIDECAR_WORKSPACE_ROOT`      | temp dir    | Allowed CLI working directory root                 |
| `OSVA_SIDECAR_EXTRA_ENV_ALLOWLIST` | unset       | Comma-separated extra env keys for child processes |

See [GEMINI_CLI_ADAPTER.md](../../docs/architecture/GEMINI_CLI_ADAPTER.md), [CODEX_CLI_ADAPTER.md](../../docs/architecture/CODEX_CLI_ADAPTER.md), [CLAUDE_CLI_ADAPTER.md](../../docs/architecture/CLAUDE_CLI_ADAPTER.md).

## Security

See [CLI_SIDECAR_SECURITY.md](../../docs/architecture/CLI_SIDECAR_SECURITY.md). Use container or OS-level isolation for untrusted repositories.

## Verification

```bash
pnpm --filter @osva-ai/runtime-cli-sidecar test
node scripts/acceptance/a2-1-pack-consumer.mjs
node scripts/acceptance/a2-2-4-pack-consumer.mjs
pnpm test:acceptance:a2-5    # Docker + OSVA RC3 worker E2E
pnpm test:release-readiness:a2-6
```

Live vendor smoke tests require operator credentials and are not part of default CI.

## OSVA worker deployment (REMOTE_HTTP)

1. Deploy sidecar on a private network reachable from the worker.
2. Set worker `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` **only** for the sidecar subnet (see [CLI_SIDECAR_SECURITY.md](../../docs/architecture/CLI_SIDECAR_SECURITY.md)).
3. Register an AgentVersion:

```json
{
  "runtime": {
    "type": "REMOTE_HTTP",
    "protocolVersion": "1",
    "endpoint": "http://cli-sidecar:9321/execute"
  }
}
```

4. Pin `@osva-ai/contracts@1.1.0-rc.4` (and matching SDK / runtime-protocol) in the deployment image.

## OCI image

Build locally (not published from CI):

```bash
docker build -t osva-cli-sidecar:local packages/runtime-cli-sidecar
```

Mount `/workspace`, set `OSVA_SIDECAR_CLI_PROVIDER`, and inject vendor credentials via secrets — never via run input.

## Release

Prepublication gate: `pnpm test:release-readiness:a2-6`. npm publish remains **manual** via `.github/workflows/publish-package.yml`.
