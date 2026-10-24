# External agent runtime inventory (A2.0)

**Scope:** Factual inventory of OSVA core (`Osva-AI/osva` at local ref `v1.1.0-rc.3-3-g1a92c90`) and **osva-adapters** (`feat/a2-0-runtime-architecture`). No implementation claims beyond cited sources.

## osva-adapters (this repository)

### Purpose and boundaries

| Document                                               | Finding                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [REPOSITORY_BOUNDARIES.md](./REPOSITORY_BOUNDARIES.md) | Infrastructure adapters only; depends on public `@osva-ai/contracts`; no OSVA core imports. |
| [CONTRIBUTING.md](../../CONTRIBUTING.md)               | Same dependency rule; osva-connectors / osva-examples out of scope.                         |

External **agent runtimes** are listed as planned in [README.md](../../README.md) and [IMPLEMENTATION_TRACKER.md](../roadmap/IMPLEMENTATION_TRACKER.md); no runtime packages exist yet.

### Packages (A1.x)

| Package                            | Contract port                                             | Entry                                                                                |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@osva-ai/adapter-artifact-memory` | `ArtifactBlobStore` / `RegisteredArtifactBlobStoreModule` | [packages/artifact-memory/src/index.ts](../../packages/artifact-memory/src/index.ts) |
| `@osva-ai/adapter-artifact-azure`  | Same                                                      | [packages/artifact-azure/src/index.ts](../../packages/artifact-azure/src/index.ts)   |

Registration pattern: export `createArtifactBlobStore(config)`; operator sets `OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE` (see [artifact-storage-config.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/artifact-storage-config.ts) in core — mirrored in [ARTIFACT_ADAPTERS.md](./ARTIFACT_ADAPTERS.md)).

**There is no analogous `REGISTER_MODULE` for `RuntimeAdapter` in published contracts.**

### CI, verification, release

| Asset                                                                                | Role                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml)                           | Lint, typecheck, build, unit tests; scoped Prettier on A1.5 paths.                                                                                                                                |
| [.github/workflows/publish-package.yml](../../.github/workflows/publish-package.yml) | Manual npm publish workflow.                                                                                                                                                                      |
| [ENGINEERING_VERIFICATION_PLAYBOOK.md](../../ENGINEERING_VERIFICATION_PLAYBOOK.md)   | `verify:a1-*`, `git diff --check`, pack consumers.                                                                                                                                                |
| [COMPATIBILITY.md](../../COMPATIBILITY.md)                                           | Pins `@osva-ai/contracts@1.1.0-rc.3`, Node `>=24`.                                                                                                                                                |
| [scripts/acceptance/a1-4/](../../scripts/acceptance/a1-4/)                           | Docker acceptance; includes **REMOTE_HTTP** agent + [fake-remote-runtime.mjs](../../scripts/acceptance/a1-4/docker/fake-remote-runtime.mjs) exercising Runtime Protocol V1 artifact capabilities. |

### Prior art for remote runtimes in acceptance

The A1.4 fake runtime implements `POST /execute` and calls worker capability URLs (`/v1/runtime/capabilities/artifacts/*`) — see [fake-remote-runtime.mjs](../../scripts/acceptance/a1-4/docker/fake-remote-runtime.mjs). AgentVersion uses `runtime.type: "REMOTE_HTTP"` ([run.mjs](../../scripts/acceptance/a1-4/run.mjs) ~L305–341).

---

## OSVA core — public contracts (`packages/contracts`)

Published as `@osva-ai/contracts@1.1.0-rc.3` ([package.json](https://github.com/Osva-AI/osva/blob/main/packages/contracts/package.json)).

### Agent runtime types (manifest)

Source: [agent-manifest.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/agent-manifest.ts)

| `AgentRuntimeType`   | Meaning                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| `BUILTIN_PACKAGE`    | Registered package key (not arbitrary import).                               |
| `TRUSTED_TYPESCRIPT` | Relative entrypoint under `OSVA_TRUSTED_RUNTIME_ROOT` + `sha256:` integrity. |
| `REMOTE_HTTP`        | HTTP(S) execute URL + protocol version `"1"` + optional `authSecretRef`.     |
| `CONTAINER`          | Digest-pinned OCI image + protocol version `"1"`.                            |
| `DECLARATIVE`        | In-worker NL agent via model/tool gateways.                                  |

Execution timeout bounds: `100`–`300_000` ms (`AGENT_EXECUTION_*` in same file).

Remote endpoint validation (privileged, not from run input): [remote-runtime.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/remote-runtime.ts) — `isAllowedRemoteRuntimeEndpoint`.

Container image validation: [container-runtime.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/container-runtime.ts) — `isDigestPinnedOciImageReference`.

Trusted entrypoint validation: [trusted-runtime.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/trusted-runtime.ts).

Declarative cross-field rules: [declarative-agent-runtime.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/declarative-agent-runtime.ts).

### Internal worker ↔ runtime port (published)

Source: [runtime-protocol.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/runtime-protocol.ts)

- `ExecutionRequest` — full frozen run context (bindings, `toolGrants`, `timeoutMs`, `policyContext`, optional evaluation / memory restriction flags).
- `ExecutionResult` — structured success/failure.
- `RuntimeAdapter` — `execute(request)`; optional `cancel?(runAttemptId)` (best-effort).

**Note:** Among production runtime executors in core, only `@osva/adapters-runtime-declarative` implements `cancel` today (see orchestration inventory below). The optional method remains part of the public contract.

### Other published surfaces relevant to external agents

| Area                                                          | Source files (contracts `src/`)                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Artifacts (platform store, not runtime bytes in execute JSON) | `artifact.ts`, `artifact-blob-store.ts`, `artifact-gateway.ts`, `artifact-storage-config.ts` |
| Model / tool capability shapes                                | `model-gateway.ts`, `tool-gateway.ts`, `tool.ts`                                             |
| Memory / knowledge                                            | `memory-gateway.ts`, `knowledge-runtime.ts`, …                                               |
| Approvals (workflow/human)                                    | `approval.ts`                                                                                |
| Run lifecycle API types                                       | `run-lifecycle.ts`, `run-state.ts`                                                           |
| MCP (connectors)                                              | `mcp-client.ts`, `mcp-server.ts`, `mcp-connector-execution.ts`                               |
| Security / secrets                                            | `security.ts`, `secret-reference.ts`, `secret-resolver.ts`                                   |
| Telemetry                                                     | `telemetry.ts`                                                                               |
| Evaluation                                                    | `evaluation.ts`, `evaluation-suite.ts`, …                                                    |

Human approval **states** are defined in `approval.ts`; enforcement for **external CLIs** is not expressed as a runtime-protocol field (see gap analysis doc).

---

## OSVA core — Runtime Protocol V1 (`packages/runtime-protocol`)

Published as `@osva-ai/runtime-protocol@1.1.0-rc.3` ([package.json](https://github.com/Osva-AI/osva/blob/main/packages/runtime-protocol/package.json)).

| File                                                                                                             | Role                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [types.ts](https://github.com/Osva-AI/osva/blob/main/packages/runtime-protocol/src/types.ts)                     | Wire messages: execute, model generate-text, tool invoke, memory, knowledge, artifacts. |
| [schemas/execute.ts](https://github.com/Osva-AI/osva/blob/main/packages/runtime-protocol/src/schemas/execute.ts) | Zod validation for execute request/response.                                            |
| [constants.ts](https://github.com/Osva-AI/osva/blob/main/packages/runtime-protocol/src/constants.ts)             | Protocol version, error codes, body limits.                                             |

Human-readable spec: [docs/contracts/RUNTIME_PROTOCOL_V1.md](https://github.com/Osva-AI/osva/blob/main/docs/contracts/RUNTIME_PROTOCOL_V1.md).

**Execute wire shape (remote):** single synchronous `POST` with `protocolVersion`, `executionId` (= RunAttemptId), `input`, and `capabilities: { endpoint, token }`. Response is JSON with `outcome` `SUCCEEDED` | `FAILED`. **No streaming execute response** in V1.

Capability bridge paths (worker-hosted): models, tools, artifacts — documented in RUNTIME_PROTOCOL_V1.md § Capability bridge.

---

## OSVA core — runtime executors (internal packages, not in osva-adapters)

Worker composition: [apps/worker/src/runtime-composition.ts](https://github.com/Osva-AI/osva/blob/main/apps/worker/src/runtime-composition.ts)

| `AgentRuntimeType`   | Package                              | Adapter class                                     |
| -------------------- | ------------------------------------ | ------------------------------------------------- |
| `TRUSTED_TYPESCRIPT` | `@osva/adapters-runtime-typescript`  | `TrustedTypeScriptRuntimeAdapter`                 |
| `DECLARATIVE`        | `@osva/adapters-runtime-declarative` | `DeclarativeRuntimeAdapter`                       |
| `REMOTE_HTTP`        | `@osva/adapters-runtime-http`        | `RemoteHttpRuntimeAdapter`                        |
| `CONTAINER`          | `@osva/adapters-runtime-container`   | `ContainerRuntimeAdapter` (if `containerEnabled`) |

Dispatch: [packages/runtime-core/src/runtime-dispatcher.ts](https://github.com/Osva-AI/osva/blob/main/packages/runtime-core/src/runtime-dispatcher.ts) — selects executor from **immutable** `request.runtime.type`; no runtime registry env var.

### REMOTE_HTTP behavior (reference for sidecars)

Implementation: [adapters/runtime-http/src/remote-http-runtime-adapter.ts](https://github.com/Osva-AI/osva/blob/main/adapters/runtime-http/src/remote-http-runtime-adapter.ts)

- One `POST` per `execute()`; no retry; no redirect follow.
- Timeout: `AbortController` on outbound fetch (`runtime.timeoutMs ?? request.timeoutMs`).
- Outbound SSRF policy via `@osva/outbound-network` (`allowPrivateNetworks` operator opt-in only).
- Capability token issuance: [capability-token.ts](https://github.com/Osva-AI/osva/blob/main/adapters/runtime-http/src/capability-token.ts).
- Capability listener: [capability-server.ts](https://github.com/Osva-AI/osva/blob/main/adapters/runtime-http/src/capability-server.ts).

Worker config knobs (excerpt): [apps/worker/src/config.ts](https://github.com/Osva-AI/osva/blob/main/apps/worker/src/config.ts) — `OSVA_TRUSTED_RUNTIME_ROOT`, `OSVA_RUNTIME_CAPABILITY_*`, container flags.

### Run execution lifecycle

Orchestration: [packages/orchestration/src/execute-run-attempt.ts](https://github.com/Osva-AI/osva/blob/main/packages/orchestration/src/execute-run-attempt.ts)

- Reconstructs `ExecutionRequest` via `@osva/runtime-core` (`createExecutionRequest`).
- Lease + heartbeat; on lease loss calls `signalRuntimeCancellation` → `runtime.cancel` **only if present**.
- Terminal states map to run outcomes (`SUCCEEDED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, …).

Architecture narrative: [docs/platform/AGENT_RUNTIME.md](https://github.com/Osva-AI/osva/blob/main/docs/platform/AGENT_RUNTIME.md), ADRs [007](https://github.com/Osva-AI/osva/blob/main/docs/adr/ADR-007-runtime-protocol-and-remote-http.md), [009](https://github.com/Osva-AI/osva/blob/main/docs/adr/ADR-009-declarative-agent-runtime.md).

### Reference remote runtime (SDK)

Example: [examples/remote-runtime-node/main.ts](https://github.com/Osva-AI/osva/blob/main/examples/remote-runtime-node/main.ts) — `@osva-ai/sdk/runtime` `createRuntime` + `createNodeHttpServer` on `/execute`.

SDK runtime HTTP handler: [packages/sdk/src/runtime/node-http.ts](https://github.com/Osva-AI/osva/blob/main/packages/sdk/src/runtime/node-http.ts).

Published SDK: `@osva-ai/sdk@1.1.0-rc.3` with export `./runtime` ([package.json](https://github.com/Osva-AI/osva/blob/main/packages/sdk/package.json)).

### Model / tool / artifact integration path for remote runtimes

Remote runtimes do **not** receive gateways or provider credentials. They call worker capability HTTP with execution-scoped bearer token and **logical binding names** only (RUNTIME_PROTOCOL_V1.md).

Artifact bytes: multipart/stream on capability routes; must not be embedded in execute JSON (same doc).

### Observability

Worker wraps runtime with `@osva/observability` instrumentation ([instrument-runtime.ts](https://github.com/Osva-AI/osva/blob/main/packages/observability/src/instrument-runtime.ts) — detects optional `cancel`).

---

## Comparison: artifact adapters vs external agent runtimes

| Dimension           | A1 artifact adapters (osva-adapters)       | External coding CLIs (A2 target)                                                                |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Contract port       | `ArtifactBlobStore`                        | No published “CLI runtime” port; use **`REMOTE_HTTP` + Runtime Protocol V1** or **`CONTAINER`** |
| Worker registration | `OSVA_ARTIFACT_BLOB_STORE_REGISTER_MODULE` | Fixed executors in worker composition                                                           |
| Process boundary    | In-process with OSVA                       | Separate process / container strongly preferred                                                 |
| Tooling             | N/A                                        | CLIs bring their own tools, sandboxes, MCP — **not** OSVA `ToolGateway` unless bridged          |

---

## Tests and docs index (core)

| Topic                          | Location                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Remote HTTP adapter unit tests | `adapters/runtime-http/test/`                                                                                        |
| Worker runtime integration     | `apps/worker/test/integration/trusted-runtime.integration.test.ts`, `container-artifact-runtime.integration.test.ts` |
| Runtime dispatcher             | `packages/runtime-core/test/runtime-dispatcher.test.ts`                                                              |
| Container flow                 | `docs/architecture/flows/container-runtime-execution.md`                                                             |

---

## osva-adapters verification status (A2.0)

Documentation-only milestone: follow [ENGINEERING_VERIFICATION_PLAYBOOK.md](../../ENGINEERING_VERIFICATION_PLAYBOOK.md) §7 (`git diff --check`) and scoped Markdown review. No new packages or `verify:a2-*` script in A2.0.
