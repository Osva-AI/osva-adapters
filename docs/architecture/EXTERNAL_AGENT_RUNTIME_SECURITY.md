# External agent runtime security (A2.0)

Security model for integrating **Codex CLI**, **Claude Code**, and **Gemini CLI** with OSVA via recommended **REMOTE_HTTP sidecar** architecture.

References: [AGENT_RUNTIME.md](https://github.com/Osva-AI/osva/blob/main/docs/platform/AGENT_RUNTIME.md), [RUNTIME_PROTOCOL_V1.md](https://github.com/Osva-AI/osva/blob/main/docs/contracts/RUNTIME_PROTOCOL_V1.md), [ADR-007](https://github.com/Osva-AI/osva/blob/main/docs/adr/ADR-007-runtime-protocol-and-remote-http.md).

---

## Threat model summary

Untrusted inputs:

- Run `input` and workflow payloads
- Repository / workspace contents the CLI can read
- Tool outputs and MCP responses (when enabled)
- Remote runtime endpoint if misconfigured (SSRF)

Trusted configuration:

- AgentVersion `runtime.endpoint`, `authSecretRef`, container digest
- Operator env (`OSVA_RUNTIME_CAPABILITY_SECRET`, network opt-ins)
- Sidecar CLI flags (sandbox, approval mode)

**Principle:** No external runtime should inherit unrestricted access to the OSVA host by default.

---

## Control matrix

| Risk                                       | OSVA core enforcement                                                                                                                               | Sidecar / CLI sandbox                                                                          | Operator duty                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Prompt injection against coding agents** | Instructions on `DECLARATIVE` agents treated as trusted config; for REMOTE_HTTP, `input` is JSON passed to sidecar — **no prompt firewall in core** | Sidecar should treat `input` as untrusted prompt material; optional system prompt separation   | Workspace isolation; review agent manifests                    |
| **Repository / filesystem access**         | REMOTE_HTTP runtime does not mount workspace into worker for remote agent                                                                           | CLI `--cd`, sandbox modes, read-only default (Codex exec)                                      | Mount minimal volume into sidecar/container only               |
| **Network egress**                         | Worker SSRF controls on **outbound execute POST**; capability bridge bound to execution token                                                       | CLI may call vendor APIs, MCP, web — **outside OSVA outbound policy**                          | NetworkPolicy / egress firewall on sidecar net                 |
| **Secret handling**                        | `authSecretRef` for remote execute Authorization; capability tokens short-lived HMAC; no plaintext secrets in manifest                              | CLI uses its own auth (`CODEX_HOME`, `claude auth`, Gemini API keys) — **must not** log tokens | Secret mounts via K8s secrets; separate credentials per tenant |
| **Tool permission boundaries**             | OSVA `ToolGateway` + declarative allowlists; **remote runtimes use capability invoke with binding names**                                           | CLIs enforce `--allowedTools`, sandbox, approval-mode                                          | Choose CLI-native vs OSVA-bridged tools explicitly             |
| **Human approval enforcement**             | OSVA approval API for workflow/human gates (contracts `approval.ts`) — **not wired to external CLI prompts**                                        | Vendor approval UX only                                                                        | Do not equate CLI auto-approve with OSVA approval records      |
| **Container / process isolation**          | `CONTAINER` runtime: digest-pinned image, bootstrap env only (AGENT_RUNTIME.md)                                                                     | Sidecar+CLI should run as non-root, separate from worker                                       | Prefer CONTAINER or dedicated sidecar pod                      |
| **Untrusted workspace contents**           | Knowledge/run input treated as untrusted in declarative doc                                                                                         | CLIs can be tricked into exfiltrating repo secrets                                             | Scan repos; limit `--add-dir` / include paths                  |
| **Runtime impersonation**                  | Capability token bound to `executionId`, workspace, run; validated on capability server                                                             | Sidecar must reject execute requests without valid worker auth (remote `authSecretRef`)        | TLS between worker and sidecar in multi-host deploys           |
| **Sensitive logs**                         | Public error sanitization in HTTP adapter (`sanitizePublicErrorMessage`)                                                                            | CLI JSONL may contain file paths, command output — **high leakage risk**                       | Log scrubbing; restrict log aggregation access                 |
| **Workspace / tenant isolation**           | Runs scoped by `workspaceId` in capability token                                                                                                    | Sidecar must not reuse CLI session across executions                                           | One execution → one CLI process; `--ephemeral` where available |
| **Cancellation / resource exhaustion**     | Execute timeout aborts **HTTP client**; lease loss calls `cancel()` only if adapter implements it (**REMOTE_HTTP does not**)                        | Orphan CLI subprocess possible until sidecar kills child                                       | Sidecar watchdog; CPU/mem limits on pod                        |
| **Supply chain**                           | Container digest pinning enforced in manifest                                                                                                       | CLI install from vendor channels                                                               | Pin versions in OCI image SBOM                                 |

---

## Prompt injection

OSVA does not sanitize natural-language content in Run input before passing it to `ExecutionRequest.input`. A sidecar that forwards `input` to `codex exec`, `claude -p`, or `gemini -p` inherits **full prompt injection** surface against the coding agent.

**Mitigations (adapter-local / operational):**

- Run CLIs in **read-only** sandbox unless manifest tier explicitly allows writes.
- Never mount OSVA DB, Valkey, or worker env into sidecar (mirror trusted TS child env omission — AGENT_RUNTIME.md).
- Separate **system** instructions (AgentVersion config in sidecar env) from **user** input (run payload).

---

## OSVA capability bridge exposure

When sidecar forwards `capabilities.endpoint` + `token` to CLI or custom code:

- Token grants **models, tools, artifacts** for that RunAttempt only (RUNTIME_PROTOCOL_V1.md).
- A compromised CLI could exfiltrate the token and invoke tools until timeout/terminal state.

**Mitigations:**

- Network: capability bridge on loopback or private network; not public bind without TLS and auth.
- Sidecar should **not** pass capability credentials into CLI flags/logs.
- Prefer CLI-native tools for untrusted tiers; bridge only for trusted agents.

---

## Default posture (recommended)

| Layer          | Default                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| Agent manifest | `REMOTE_HTTP` to sidecar on private network; `authSecretRef` required in production           |
| Sidecar        | Spawn CLI with vendor **read-only** or minimal write sandbox                                  |
| Worker         | `OSVA_REMOTE_HTTP_ALLOW_PRIVATE_NETWORKS=true` only for sidecar subnet; capability secret set |
| Data           | Artifacts via capability `artifacts/create`, not giant stdout payloads                        |

---

## What A2.1 must prove

- Sidecar runs CLI with **non-default-dangrous** flags (no `yolo` / `danger-full-access` in reference harness).
- Execute auth secret required between worker and sidecar.
- Child process killed when HTTP request aborts (worker timeout).
- Evidence that capability token never appears in sidecar stdout logs (automated scan in acceptance).
