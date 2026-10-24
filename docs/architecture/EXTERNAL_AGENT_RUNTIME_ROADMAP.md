# External agent runtime roadmap (A2.x)

Implementation plan for Codex CLI, Claude Code, and Gemini CLI integration via **osva-adapters**, aligned with A2.0 architecture audit.

**Architecture baseline:** Hybrid **REMOTE_HTTP sidecar** (+ optional **CONTAINER** image), Runtime Protocol V1, no worker-local CLI subprocess adapter.

---

## Milestone overview

| ID   | Title                                               | Status                  |
| ---- | --------------------------------------------------- | ----------------------- |
| A2.0 | Architecture and contract audit                     | **Done (this doc set)** |
| A2.1 | Minimal reference CLI runtime sidecar               | Planned                 |
| A2.2 | First officially supported external coding agent    | Planned                 |
| A2.3 | Second external coding agent                        | Planned                 |
| A2.4 | Third external coding agent                         | Planned                 |
| A2.5 | Cross-runtime conformance and deployment acceptance | Planned                 |
| A2.6 | npm release readiness and publication               | Planned                 |

---

## A2.0 — Architecture and contract audit

**Scope:** Inventory, external CLI research, strategy decision, security, contract gaps, roadmap.

**Dependencies:** OSVA `v1.1.0-rc.3` reference tree; official CLI documentation.

**Acceptance criteria:**

- [x] Architecture docs under `docs/architecture/`
- [x] IMPLEMENTATION_TRACKER updated
- [x] Claims cite osva / osva-adapters files or official CLI docs
- [x] Unverified assumptions marked

**Verification gates:** `git diff --check`; doc link sanity; no new packages.

**Security:** Document default isolation and secret boundaries.

**Deferred:** CLI version pins, implementation, core contract changes.

---

## A2.1 — Minimal reference CLI runtime sidecar

**Scope:**

- New package (name TBD, e.g. `@osva-ai/adapter-runtime-cli-sidecar`) implementing Runtime Protocol V1 `/execute` using `@osva-ai/sdk/runtime`.
- Pluggable **backend interface** with one **stub** or **echo** backend for tests (no vendor CLI required in unit tests).
- Child-process supervisor: spawn, stdout/stderr capture, timeout kill on HTTP abort.
- Docker Compose snippet (optional) wiring worker `REMOTE_HTTP` → sidecar on private network (extend A1.4 patterns).

**Dependencies:** A2.0; npm `@osva-ai/sdk@1.1.0-rc.3`, `@osva-ai/runtime-protocol@1.1.0-rc.3`.

**Acceptance criteria:**

- Hermetic unit tests for request/response mapping and timeout kill.
- Documented operator env for sidecar auth (mirror remote runtime `Authorization`).
- Sidecar never logs capability `token` (automated test or grep harness).
- README with AgentVersion `REMOTE_HTTP` example manifest.

**Verification gates:** `pnpm` lint/typecheck/build/test for new package; `git diff --check`.

**Security requirements:** Default sandbox profile documented as read-only; no bypass flags in reference harness.

**Deferred:** OSVA capability bridge from CLI; streaming to RunSteps; `cancel` HTTP API.

---

## A2.2 — First external coding agent (Gemini CLI)

**Rationale:** Verified headless + `stream-json` + exit codes in upstream [headless.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md); open-source CLI project aids CI.

**Scope:** Gemini backend for sidecar; pin CLI version in devcontainer/Dockerfile; map `--output-format json` to Run output schema.

**Dependencies:** A2.1 sidecar framework.

**Acceptance criteria:**

- End-to-end compose: OSVA worker → sidecar → `gemini -p` with API key from env (not committed).
- Success and failure paths (exit code `1`, `42` documented).
- Sandbox flag `--sandbox` or `--approval-mode` documented in operator guide.

**Verification gates:** Opt-in integration job (env-gated like Azurite); not in default CI if API key required.

**Security:** API keys via secret env; network egress documented.

**Deferred:** `stream-json` live forwarding to OSVA observability.

---

## A2.3 — Second external coding agent (Codex CLI)

**Scope:** `codex exec --json` backend; `--sandbox read-only` default; `--cd` workspace from mounted volume.

**Dependencies:** A2.1.

**Acceptance criteria:**

- Parse JSONL to extract final agent message or structured `--output-schema` result.
- Document `CODEX_HOME` / auth setup for acceptance operators.

**Verification gates:** Integration test with recorded JSONL fixtures (hermetic) + optional live opt-in.

**Security:** Reject `danger-full-access` in reference configs.

**Deferred:** `codex exec resume` session reuse across RunAttempts.

---

## A2.4 — Third external coding agent (Claude Code)

**Scope:** `claude -p` backend with `--output-format json`; optional `--bare` for faster CI.

**Dependencies:** A2.1.

**Acceptance criteria:**

- JSON result mapping (`result`, `structured_output` when schema used).
- Auth documented (`claude setup-token` or API key path).

**Verification gates:** Hermetic tests with fixture JSON; opt-in live job.

**Security:** `--allowedTools` allowlist documented; no `--dangerously-skip-permissions` in defaults.

**Deferred:** Agent SDK embedding (strategy C) unless CLI subprocess insufficient.

---

## A2.5 — Cross-runtime conformance and deployment acceptance

**Scope:**

- Shared conformance suite: execute auth, timeout, idempotent redelivery behavior, output JSON schema validation, secret scan on logs.
- Extend deployment acceptance harness (A1.4-style) with sidecar service + selected CLI image.
- Document OSVA human approval **non-equivalence** with CLI approvals.

**Dependencies:** A2.2–A2.4 at least one backend each.

**Acceptance criteria:**

- `evidence/latest.json` (or successor) includes external runtime scenarios.
- Matrix doc comparing Gemini / Codex / Claude feature support (updated from A2.0 tables).

**Verification gates:** `pnpm verify:a2-5` (to be defined); Docker required.

**Security:** Negative tests: invalid auth, excessive output size (>1 MiB protocol limit), forbidden sandbox flags rejected by sidecar config validator.

**Deferred:** OSVA capability tool bridging; RunStep-level streaming.

---

## A2.6 — npm release readiness and publication

**Scope:** CI for new packages, pack inspect, external consumer script, MAINTAINER_RELEASE update, initial npm publish.

**Dependencies:** A2.5; maintainer npm access.

**Acceptance criteria:** Mirror A1.5 gates for runtime sidecar package(s).

**Verification gates:** `verify:a2-6` script; manual publish workflow extension.

**Security:** Prepublish secret scan; SBOM for container images if published.

**Deferred:** None for publication slice.

---

## Blocking decisions (track before A2.1 coding)

| Decision                | Options                                                          | Recommendation                                              |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Sidecar deployment      | K8s Deployment vs sidecar container in compose vs CONTAINER-only | Compose + K8s Deployment docs; digest-pinned image for prod |
| CLI auth in CI          | Skip live vendor APIs vs recorded fixtures vs self-hosted mocks  | Hermetic fixtures in CI; live opt-in job                    |
| OSVA tools vs CLI tools | Capability bridge vs CLI-only                                    | CLI-only until A2.5                                         |
| Output contract         | Free-form JSON vs strict AgentVersion output schema              | Require manifest output schema for official agents          |
| Multi-tenant            | One sidecar per workspace vs shared                              | Shared sidecar with per-run process isolation minimum       |

---

## READY recommendation for A2.1

**READY** — published contracts and SDK are sufficient for a REMOTE_HTTP sidecar in osva-adapters without OSVA core changes.

**Conditions:**

- Accept synchronous execute semantics and sidecar-local process supervision.
- Resolve blocking decisions table for auth and deployment before merging A2.1 production defaults.
