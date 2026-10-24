# CLI runtime sidecar design (A2.1)

## Purpose

`@osva-ai/runtime-cli-sidecar` is a vendor-neutral HTTP service that implements
[Runtime Protocol V1](https://github.com/Osva-AI/osva/blob/main/docs/contracts/RUNTIME_PROTOCOL_V1.md)
execute semantics and delegates work to an injectable **CLI execution provider**.

OSVA workers reach the sidecar through `AgentRuntimeType.REMOTE_HTTP` (`POST /execute`).
The sidecar spawns an isolated CLI child process and maps structured CLI output into
protocol success/failure envelopes.

## Architecture

```text
OSVA worker (RemoteHttpRuntimeAdapter)
    |  POST /execute (Runtime Protocol V1 JSON)
    v
@osva-ai/runtime-cli-sidecar
    |  SDK createRuntimeHandler (validation)
    |  ExecutionRegistry (dedupe + concurrency)
    |  CliExecutionProvider (injectable)
    v
CLI child process (fixture or gemini | codex | claude provider)
```

## Public integration surfaces

| Surface                         | Role                                               |
| ------------------------------- | -------------------------------------------------- |
| `@osva-ai/sdk/runtime`          | Request validation and V1 response shaping         |
| `@osva-ai/runtime-protocol`     | Wire schemas and body limits                       |
| `CliExecutionProvider`          | Vendor-neutral CLI launch + output parsing port    |
| `createCliSidecar()`            | HTTP server with health, auth, lifecycle hooks     |
| `fixtures/osva-fixture-cli.mjs` | Deterministic subprocess fixture (acceptance only) |

## Execution identity and deduplication

- Wire field `executionId` is treated as canonical RunAttempt identity.
- Overlapping requests for the same ID and **identical run input** coalesce onto one in-flight CLI child.
- Same `executionId` with a **different** run input is rejected (`RUNTIME_PROTOCOL_FAILURE`).
- Completed responses are cached in memory (bounded count + TTL) for identical redelivery.
- **After process restart**, cache and in-flight state are lost; the same ID may run again.
- This is **not** durable exactly-once execution (no Redis/Postgres in A2.1).

## Process lifecycle

- Wall-clock deadlines (`deadlineMs` from run input, capped at 300s, with sidecar default).
- Timeout and client disconnect abort signals terminate the **process tree** (best effort).
- Stdout/stderr collection is bounded per configuration.
- `beginDraining()` / `close()` reject new execute requests; readiness returns 503 while draining.

## Unsupported by published contracts (documented)

- Cooperative `RuntimeAdapter.cancel` forwarding from worker to REMOTE_HTTP sidecar (worker adapter does not call cancel today).
- Streaming execute progress on the V1 wire (sync POST only).
- OSVA human approval bridge to interactive CLI prompts.
- Worker workspace bind-mount contract for sidecar cwd (operator supplies `OSVA_SIDECAR_WORKSPACE_ROOT`).

## Provider selection (A2.2–A2.4)

| Env                         | Values                                           |
| --------------------------- | ------------------------------------------------ |
| `OSVA_SIDECAR_CLI_PROVIDER` | `fixture` (default), `gemini`, `codex`, `claude` |

Factory: `createCliProviderFromSidecarConfig()` / `createCliProvider()`.
Vendor adapters live under `src/providers/{gemini,codex,claude}-provider.ts`.

See adapter docs: [GEMINI_CLI_ADAPTER.md](./GEMINI_CLI_ADAPTER.md), [CODEX_CLI_ADAPTER.md](./CODEX_CLI_ADAPTER.md), [CLAUDE_CLI_ADAPTER.md](./CLAUDE_CLI_ADAPTER.md), [CLI_PROVIDER_CONFORMANCE.md](./CLI_PROVIDER_CONFORMANCE.md).

## A2.5 dependencies

Cross-runtime deployment acceptance (Compose + OSVA worker + sidecar image) remains A2.5.
