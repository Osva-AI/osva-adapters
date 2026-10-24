# CLI runtime sidecar security (A2.1)

## Scope

Security controls for `@osva-ai/runtime-cli-sidecar` when used as a REMOTE_HTTP agent
runtime. This document describes **defense in depth**; it does not claim that a Node.js
`child_process` alone provides a filesystem, network, or OS sandbox.

**Operator requirement:** Run the sidecar in a container or OS-level isolated environment
when executing against untrusted repositories or prompts.

## Network binding

| Control       | Default                             | Notes                                                                  |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| Bind address  | `127.0.0.1`                         | Wider exposure requires explicit `OSVA_SIDECAR_HOST`                   |
| Execute auth  | Optional `OSVA_SIDECAR_AUTH_SECRET` | Shared secret for worker→sidecar `/execute` only; not tenant isolation |
| Health routes | Unauthenticated                     | Liveness/readiness only; no execution data                             |

## Command execution

- Providers supply **explicit argv arrays**; the sidecar never uses `shell: true`.
- Request input must not select arbitrary binaries; only the configured provider command runs.
- Capability bridge credentials in execute JSON are **not** forwarded to CLI environment or argv.
- Interactive approval fields in run input are rejected.

## Filesystem

- Working directory is resolved under `OSVA_SIDECAR_WORKSPACE_ROOT`.
- Path traversal (`..`, absolute escape) is rejected before spawn.

## Environment

- Child processes receive an **allowlisted** subset of host environment variables by default.
- Provider-specific env entries are merged on top of the filtered base.

## Resource limits

- Request body size: `RUNTIME_PROTOCOL_MAX_BODY_BYTES` (protocol constant).
- Concurrent executions: `OSVA_SIDECAR_MAX_CONCURRENT` (default 4).
- Stdout/stderr caps: `OSVA_SIDECAR_MAX_STDOUT_BYTES` / `OSVA_SIDECAR_MAX_STDERR_BYTES`.
- Execution deadline: wall-clock timeout with process-tree termination.

## Logging

Structured events include `executionId` for correlation. Log redaction removes:

- Capability tokens and `Bearer` headers
- Common secret field names in JSON log payloads

Full prompts are not logged by default.

## OSVA worker SSRF

Outbound execute POST policy (`@osva/outbound-network`) is enforced in **OSVA core**, not
in the sidecar. Operators must configure allowed remote endpoints and private-network opt-in
per existing REMOTE_HTTP documentation. **Do not weaken SSRF restrictions** to pass tests.

## Vendor CLI policy (A2.2–A2.4)

- Provider kind and binary path are **operator env only** (`OSVA_SIDECAR_CLI_PROVIDER`, `OSVA_SIDECAR_*_BINARY`).
- Run input cannot set `provider`, `command`, `sandbox`, `yolo`, or `dangerouslySkipPermissions`.
- Gemini: rejects `yolo` / `auto_edit` approval modes; default `--sandbox`.
- Codex: rejects `danger-full-access`; default `--sandbox read-only`.
- Claude: default `--bare` + `--allowedTools` from env; no skip-permissions flags.
- Vendor API keys are allowlisted env vars only — OSVA capability tokens are never passed to CLI children.

## Known limitations

- In-memory deduplication only; no cross-replica coordination.
- Client disconnect abort applies to the primary request for an `executionId`, not coalesced duplicates.
- No built-in seccomp/AppArmor; use container isolation for untrusted code paths.
- Shared sidecar + shared host credentials are **not** multi-tenant isolation.
