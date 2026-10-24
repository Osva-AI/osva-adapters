# @osva-ai/runtime-cli-sidecar

Vendor-neutral HTTP sidecar for running CLI-based agent runtimes through **OSVA Runtime Protocol V1**.

A2.1 ships infrastructure only: injectable `CliExecutionProvider`, deterministic fixture CLI, and acceptance tests. Vendor CLIs (Gemini, Codex, Claude Code) land in A2.2+.

## Install

```bash
npm install @osva-ai/runtime-cli-sidecar @osva-ai/sdk@1.1.0-rc.3 @osva-ai/runtime-protocol@1.1.0-rc.3 @osva-ai/contracts@1.1.0-rc.3
```

## Run (fixture provider)

```bash
export OSVA_SIDECAR_HOST=127.0.0.1
export OSVA_SIDECAR_PORT=9321
export OSVA_SIDECAR_WORKSPACE_ROOT=/tmp/osva-cli-workspace
osva-runtime-cli-sidecar
```

## Programmatic use

```typescript
import {
  createCliSidecar,
  createFixtureCliProvider,
  loadSidecarConfigFromEnv,
} from "@osva-ai/runtime-cli-sidecar";

const config = loadSidecarConfigFromEnv();
const provider = createFixtureCliProvider({
  workspaceRoot: config.workspaceRoot,
});
const sidecar = createCliSidecar({ provider, config });
await sidecar.listen();
```

Implement `CliExecutionProvider` for vendor backends (explicit argv, no shell interpolation).

## Protocol

- `POST /execute` — Runtime Protocol V1 (via `@osva-ai/sdk/runtime` handler)
- `GET /health/live` — process up
- `GET /health/ready` — accepting work (503 while draining)

## Configuration (environment)

| Variable                           | Default     | Description                         |
| ---------------------------------- | ----------- | ----------------------------------- |
| `OSVA_SIDECAR_HOST`                | `127.0.0.1` | Bind host                           |
| `OSVA_SIDECAR_PORT`                | `9321`      | Bind port                           |
| `OSVA_SIDECAR_AUTH_SECRET`         | unset       | Optional Bearer auth for `/execute` |
| `OSVA_SIDECAR_WORKSPACE_ROOT`      | temp dir    | Allowed CLI working directory root  |
| `OSVA_SIDECAR_MAX_CONCURRENT`      | `4`         | Max parallel CLI children           |
| `OSVA_SIDECAR_DEFAULT_DEADLINE_MS` | `120000`    | Default execution deadline          |
| `OSVA_SIDECAR_MAX_STDOUT_BYTES`    | `1048576`   | Stdout capture limit                |
| `OSVA_SIDECAR_MAX_STDERR_BYTES`    | `262144`    | Stderr capture limit                |

## Security

See [CLI_SIDECAR_SECURITY.md](../../docs/architecture/CLI_SIDECAR_SECURITY.md). Use container or OS-level isolation for untrusted repositories.

## Verification

```bash
pnpm --filter @osva-ai/runtime-cli-sidecar test
node scripts/acceptance/a2-1-pack-consumer.mjs
```
