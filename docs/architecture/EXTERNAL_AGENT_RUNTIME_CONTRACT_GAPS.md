# External agent runtime contract gaps (A2.0)

Classification of capabilities needed to support external coding CLIs **without OSVA core changes in A2.0**, and minimal future core changes if unavoidable.

**Legend:**

| Class        | Meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| **PUBLIC**   | Supported by published `@osva-ai/contracts` / `@osva-ai/runtime-protocol` |
| **INTERNAL** | Implemented in core but not a stable extension point for osva-adapters    |
| **MISSING**  | No contract today                                                         |
| **ADAPTER**  | Implement in osva-adapters sidecar only                                   |
| **CORE**     | Requires Osva-AI/osva change                                              |

---

## Can published contracts support CLI runtimes without changes?

**Yes, for the recommended path:** `AgentManifestV1.runtime.type === "REMOTE_HTTP"` (or `CONTAINER`) + Runtime Protocol V1 sidecar.

No new `AgentRuntimeType` is strictly required for A2.1–A2.4 if the sidecar speaks `/execute`.

---

## Capability matrix

| Capability                                               | Class                                                                                  | Notes                                                                                                                                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declare remote execute URL                               | **PUBLIC**                                                                             | `RemoteHttpRuntime` in [agent-manifest.ts](https://github.com/Osva-AI/osva/blob/main/packages/contracts/src/agent-manifest.ts)                                                                                            |
| Validate HTTP endpoint shape                             | **PUBLIC**                                                                             | `isAllowedRemoteRuntimeEndpoint`                                                                                                                                                                                          |
| Pass JSON run input to runtime                           | **PUBLIC**                                                                             | `ExecutionRequest.input` / wire `input`                                                                                                                                                                                   |
| Return JSON output on success                            | **PUBLIC**                                                                             | `ExecutionResult` / `RuntimeExecuteSuccess`                                                                                                                                                                               |
| Timeout enforcement (worker → sidecar HTTP)              | **PUBLIC**                                                                             | `execution.timeoutMs`, adapter `AbortController`                                                                                                                                                                          |
| Outbound SSRF policy for execute POST                    | **INTERNAL**                                                                           | `@osva/outbound-network` in worker adapter — operator env only                                                                                                                                                            |
| Capability bridge (models/tools/artifacts)               | **PUBLIC** wire in `@osva-ai/runtime-protocol`; **INTERNAL** worker server             | Sidecar may consume credentials in execute payload                                                                                                                                                                        |
| Digest-pinned container runtime                          | **PUBLIC**                                                                             | `ContainerRuntime` + `isDigestPinnedOciImageReference`                                                                                                                                                                    |
| Register external `RuntimeAdapter` module like artifacts | **MISSING**                                                                            | Artifacts: `RegisteredArtifactBlobStoreModule`; runtimes: hardcoded [runtime-composition.ts](https://github.com/Osva-AI/osva/blob/main/apps/worker/src/runtime-composition.ts) — **CORE** if subprocess-in-worker desired |
| Streaming run progress to OSVA UI                        | **MISSING** on execute wire                                                            | Sync POST only — **ADAPTER** logs; **CORE** if first-class RunStep streaming required                                                                                                                                     |
| Cooperative `RuntimeAdapter.cancel` for REMOTE_HTTP      | **PUBLIC** optional method; **INTERNAL** not implemented on `RemoteHttpRuntimeAdapter` | **ADAPTER** sidecar kill on disconnect; **CORE** optional `cancel` forwarding                                                                                                                                             |
| Map CLI exit codes → OSVA error codes                    | **ADAPTER**                                                                            | Map to `AGENT_EXECUTION_FAILED` messages in sidecar response                                                                                                                                                              |
| Human approval parity with OSVA approvals                | **MISSING** bridge                                                                     | CLI approvals ≠ `ApprovalRequest` — **ADAPTER**/workflow design or **CORE** integration                                                                                                                                   |
| MCP connector as runtime                                 | **MISSING**                                                                            | MCP is tool transport ([mcp-* contracts](https://github.com/Osva-AI/osva/tree/main/packages/contracts/src)) — not `RuntimeAdapter`                                                                                        |
| Publish sidecar helper SDK                               | **PUBLIC**                                                                             | `@osva-ai/sdk/runtime` already published                                                                                                                                                                                  |
| Dependency in osva-adapters on runtime-protocol          | **PUBLIC** npm package                                                                 | Today adapters pin only `@osva-ai/contracts`; adding `@osva-ai/runtime-protocol` + `@osva-ai/sdk` is allowed without core change                                                                                          |
| RunStep / observability events from external CLI         | **INTERNAL**                                                                           | Worker instrumentation wraps `execute()` duration, not per-tool CLI events — **ADAPTER** structured logs                                                                                                                  |
| Tool grants on run                                       | **PUBLIC** field exists; **INTERNAL** empty placeholder                                | `toolGrants` frozen empty per AGENT_RUNTIME.md declarative section — **CORE** for grant population                                                                                                                        |
| Workspace filesystem injection into runtime              | **MISSING**                                                                            | No manifest field for git checkout path — **ADAPTER** + operator mounts CONTAINER/sidecar volume                                                                                                                          |
| Multi-turn session reuse (`executionId` redelivery)      | **PUBLIC** identity rules                                                              | Same `executionId` on redelivery — sidecar must idempotently handle or reject duplicate CLI sessions — **ADAPTER**                                                                                                        |
| CLI version pin in manifest                              | **MISSING**                                                                            | Only container digest or sidecar deployment version — **ADAPTER** image tag; optional future manifest extension — **CORE** if needed                                                                                      |

---

## Smallest backward-compatible core changes (if pursued later)

Not required for A2.1. Listed for planning only — **do not implement in A2.0**.

1. **`RemoteHttpRuntimeAdapter.cancel`**: track in-flight fetch + optional sidecar `DELETE /execute/:executionId` — extends optional contract method; backward compatible.

2. **Runtime registration env** (mirror artifacts): e.g. `OSVA_RUNTIME_ADAPTER_REGISTER_MODULE` — large surface; prefer staying with REMOTE_HTTP sidecar.

3. **Manifest extension** `runtime.config` for REMOTE_HTTP sidecars (CLI profile, sandbox enum) — would require schema + validation in contracts; sidecar can use AgentVersion `effectiveConfig` JSON today if snapshotted via manifest output schema / custom keys ⚠️ verify manifest schema allows arbitrary config bags — currently runtime types are structured, not free-form for REMOTE_HTTP.

**Workaround without core change:** Encode CLI profile in AgentVersion `input`/`output` schema defaults or agent `key` convention; sidecar reads `input.cliProfile` validated by JSON Schema on manifest.

---

## osva-adapters dependency boundary (A2.x)

Per [CONTRIBUTING.md](../../CONTRIBUTING.md):

- Allowed: `@osva-ai/contracts`, `@osva-ai/runtime-protocol`, `@osva-ai/sdk` (public npm).
- Forbidden: `@osva/domain`, `@osva/adapters-runtime-http`, worker apps.

Sidecar packages are **not** loaded into the worker process; they deploy as separate HTTP services or container images.

---

## COMPATIBILITY.md impact

No change required for A2.0. Update when first `@osva-ai/adapter-runtime-*` package pins additional npm deps (A2.6).
