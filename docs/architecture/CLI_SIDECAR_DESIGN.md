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
CLI child process (fixture or vendor adapter in A2.2+)
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

## A2.2+ dependencies

Vendor backends implement `CliExecutionProvider` with allowlisted binaries and sandbox flags.
A2.5 adds cross-runtime acceptance against a live OSVA REMOTE_HTTP agent when operator network policy allows.
