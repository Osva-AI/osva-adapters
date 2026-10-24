# External agent runtime options (A2.0)

Research on **OpenAI Codex CLI**, **Anthropic Claude Code**, and **Google Gemini CLI**, plus integration strategy comparison for OSVA.

**Legend:** ✅ verified from official docs or OSVA source cited below. ⚠️ assumption or not verified in this audit.

---

## Phase 1 — External runtime research

### 1. OpenAI Codex CLI

**Primary sources (verified):**

- [Non-interactive mode](https://developers.openai.com/codex/noninteractive.md) (also mirrored on ChatGPT Learn).
- [Developer commands — `codex exec`](https://learn.chatgpt.com/docs/developer-commands).

| #   | Topic                      | Finding                                                                                                                    | Status          |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Programmatic invocation    | `codex exec [PROMPT]`; stdin can augment prompt                                                                            | ✅              |
| 2   | Headless / non-interactive | `codex exec` designed for CI/scripts; default read-only sandbox                                                            | ✅              |
| 3   | Structured I/O             | `--json` → JSONL on stdout; final text also available without JSON; `--output-schema` + `-o` for schema-constrained output | ✅              |
| 4   | Streaming events           | JSONL event types: `thread.started`, `turn.*`, `item.*`, `error` (per official doc samples)                                | ✅              |
| 5   | Tool permissions           | `--sandbox read-only \| workspace-write \| danger-full-access`; `--approve-for-me` / policy flags documented               | ✅              |
| 6   | Approvals                  | Sandbox + execpolicy `.rules`; `--ignore-rules` for controlled automation; not OSVA human-approval API                     | ✅              |
| 7   | Workspace / FS             | `--cd` / `-C` workspace root; `workspace-write` for edits                                                                  | ✅              |
| 8   | Auth                       | Uses `CODEX_HOME` config; `--ignore-user-config` still uses auth from `CODEX_HOME` (per docs)                              | ✅              |
| 9   | Session continuation       | `codex exec resume [SESSION_ID]`, `--last`                                                                                 | ✅              |
| 10  | Timeouts / cancellation    | ⚠️ No explicit `--timeout` cited in sampled docs; subprocess kill is operator responsibility                               | ⚠️              |
| 11  | Child-process lifecycle    | CLI subprocess; parent must reap/kill                                                                                      | ⚠️              |
| 12  | Sandboxing                 | Built-in sandbox modes; `danger-full-access` / `--yolo` explicitly dangerous                                               | ✅              |
| 13  | Artifacts / files          | File change events in JSONL (`item.*`); no OSVA `ArtifactReferenceV1` native                                               | ✅              |
| 14  | Version compatibility      | Pin CLI in container image; event schema in openai/codex repo (`exec_events.rs`)                                           | ⚠️ pin in A2.2+ |
| 15  | Licensing / distribution   | OpenAI product terms; CLI distributed via OpenAI channels — verify license before redistributing in public images          | ⚠️              |

**OSVA mapping note:** Codex uses **native tools and MCP** inside the CLI. That is parallel to, not a substitute for, OSVA Runtime Protocol capability bridge (see inventory doc).

---

### 2. Anthropic Claude Code

**Primary sources (verified):**

- [Run Claude Code programmatically (headless)](https://code.claude.com/docs/en/headless).
- [CLI reference](https://code.claude.com/docs/en/cli-reference).

| #   | Topic                    | Finding                                                                                                              | Status |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Programmatic invocation  | `claude -p "query"` / `--print`; Agent SDK also available (TS/Python) per same doc set                               | ✅     |
| 2   | Headless                 | `-p` runs non-interactively; pipes supported                                                                         | ✅     |
| 3   | Structured I/O           | `--output-format text \| json \| stream-json`; `--json-schema` with `structured_output` in JSON                      | ✅     |
| 4   | Streaming                | `stream-json` + `--verbose` (+ optional partial messages)                                                            | ✅     |
| 5   | Tool permissions         | `--allowedTools` / `--tools`; permission modes (`plan`, `bypassPermissions`, etc.)                                   | ✅     |
| 6   | Approvals                | Interactive approval loop skipped or constrained in `-p`; `--permission-prompts none` removes ask-user tools         | ✅     |
| 7   | Workspace / FS           | `--add-dir`; default cwd semantics                                                                                   | ✅     |
| 8   | Auth                     | `claude auth login`, API key / subscription paths; `claude setup-token` for CI                                       | ✅     |
| 9   | Session continuation     | `-c`, `-r`, `session_id` in JSON output                                                                              | ✅     |
| 10  | Timeouts / cancellation  | `--max-turns`; budget caps (`--max-budget-usd` mentioned in headless doc); subprocess SIGTERM ⚠️ not fully specified | ⚠️     |
| 11  | Child-process lifecycle  | Standard CLI process                                                                                                 | ⚠️     |
| 12  | Sandboxing               | Permission modes + optional gateway/self-hosted runner paths; not OSVA container model by default                    | ✅     |
| 13  | Artifacts                | File edits via tools; no native OSVA artifact protocol                                                               | ✅     |
| 14  | Version compatibility    | Pin via `claude install <version>`                                                                                   | ✅     |
| 15  | Licensing / distribution | Anthropic terms; subscription vs Console API billing split                                                           | ⚠️     |

**Distinction:** Claude **Agent SDK** is a first-class programmatic API. It is **not** the same as wiring OSVA `REMOTE_HTTP`, but a sidecar _could_ embed the SDK instead of spawning `claude -p` (strategy C).

---

### 3. Google Gemini CLI

**Primary sources (verified):**

- [Headless mode reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md) (upstream repo).
- [Automation tutorial](https://geminicli.com/docs/cli/tutorials/automation/).
- [CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md).

| #   | Topic                    | Finding                                                                                                      | Status                |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| 1   | Programmatic invocation  | `gemini -p "query"`; positional prompt in TTY vs headless rules in cheatsheet                                | ✅                    |
| 2   | Headless                 | `-p` or non-TTY triggers headless (per headless.md)                                                          | ✅                    |
| 3   | Structured I/O           | `--output-format text \| json \| stream-json` (json object: `response`, `stats`, optional `error`)           | ✅                    |
| 4   | Streaming                | `stream-json` JSONL: `init`, `message`, `tool_use`, `tool_result`, `error`, `result`                         | ✅                    |
| 5   | Tool permissions         | `--approval-mode default \| auto_edit \| yolo \| plan`; deprecated `--allowed-tools`                         | ✅                    |
| 6   | Approvals                | Approval modes at CLI level; not OSVA approval API                                                           | ✅                    |
| 7   | Workspace / FS           | `--include-directories`, `--all-files`, trust/skip-trust flags                                               | ✅                    |
| 8   | Auth                     | Gemini API / Google auth via CLI configuration (see configuration guide)                                     | ⚠️ detail in env docs |
| 9   | Session continuation     | `--resume` / `-r` with session id or `latest`                                                                | ✅                    |
| 10  | Timeouts / cancellation  | Documented **exit codes** including turn limit (`53`); explicit wall-clock timeout flag ⚠️ not verified here | ⚠️                    |
| 11  | Child-process lifecycle  | CLI subprocess                                                                                               | ⚠️                    |
| 12  | Sandboxing               | `--sandbox` flag documented in CLI reference                                                                 | ✅                    |
| 13  | Artifacts                | Tool output in stream; no OSVA artifact types                                                                | ✅                    |
| 14  | Version compatibility    | `gemini update`; pin in OCI image for production                                                             | ✅                    |
| 15  | Licensing / distribution | Open-source CLI (Apache-2.0 project); API usage still subject to Google terms                                | ⚠️                    |

---

## Phase 2 — Integration strategy comparison

| Strategy                                 | Description                                                                                                                                          | OSVA contract fit                                                                                                              | Isolation                                                    | Streaming / observability                                                      | OSVA human approval                          | Ops complexity                                   | Testability                                         | Extensibility                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------- |
| **A. Direct CLI subprocess adapter**     | Worker (or new registered module) spawns `codex`/`claude`/`gemini` per run                                                                           | ❌ No published worker hook to register new `RuntimeAdapter`; would need **core change** or abuse `TRUSTED_TYPESCRIPT` wrapper | ⚠️ Weak — CLI shares worker image network/FS unless wrapped  | CLI JSONL → must aggregate to single `ExecutionResult`                         | ❌ CLI-local only                            | Low image count, **high** blast radius on worker | Hard to hermetic-test without core                  | One adapter per CLI                           |
| **B. Long-running HTTP runtime sidecar** | Sidecar implements Runtime Protocol V1 `POST /execute`; internally spawns CLI                                                                        | ✅ **`REMOTE_HTTP`** AgentVersion + `@osva-ai/runtime-protocol` / `@osva-ai/sdk/runtime`                                       | ✅ Sidecar in separate container/network namespace           | CLI streams → sidecar logs/metrics; **execute response still synchronous**     | ❌ unless sidecar bridges to OSVA tools only | Medium — sidecar + capability bridge networking  | ✅ Hermetic sidecar unit tests + A1.4-style compose | New sidecar flavor per CLI                    |
| **C. Provider agent SDK in sidecar**     | Sidecar uses Claude Agent SDK / future Codex SDK instead of raw CLI                                                                                  | ✅ Same as B if sidecar speaks Runtime Protocol V1                                                                             | ✅ Same as B                                                 | SDK-dependent                                                                  | Same as B                                    | Medium–high                                      | SDK version coupling                                | Per provider                                  |
| **D. MCP-mediated integration**          | Expose OSVA as MCP server; CLI connects as MCP client                                                                                                | ⚠️ **Tool connector** path (`mcp-*` contracts), **not** `RuntimeAdapter`                                                       | Depends on MCP server placement                              | MCP notifications ≠ run lifecycle events                                       | Partial (OSVA tool approval paths)           | High conceptual mismatch                         | Different test matrix                               | Confuses tool vs runtime                      |
| **E. Hybrid (recommended)**              | **B + CONTAINER option**: sidecar package in osva-adapters; deploy as REMOTE_HTTP service or digest-pinned **CONTAINER** image running sidecar + CLI | ✅ Uses existing manifest types                                                                                                | ✅ Strongest when sidecar+CLI in OCI with no worker FS mount | Sidecar forwards structured CLI events to logs; optional future core streaming | Defer OSVA approval bridging to A2.5+        | Balanced                                         | Compose + pack consumer pattern                     | Add CLI backends behind one sidecar interface |

### Recommended smallest safe architecture (A2.1+)

**Hybrid E (HTTP sidecar first, optional CONTAINER packaging):**

1. **osva-adapters** publishes a **reference sidecar** (Node or minimal wrapper) that:
   - Implements Runtime Protocol V1 execute endpoint (prefer `@osva-ai/sdk/runtime` — same pattern as [remote-runtime-node](https://github.com/Osva-AI/osva/blob/main/examples/remote-runtime-node/main.ts)).
   - Maps OSVA `input` → CLI argv/stdin; maps CLI exit code + structured output → `RuntimeExecuteResponse.output`.
   - Runs CLI in **child process** with **operator-configured** sandbox flags (never default to bypass/yolo).
   - Optionally proxies **capability bridge** to CLI MCP (explicit opt-in; deferred complexity).

2. **Operators** register agents with `runtime.type: "REMOTE_HTTP"` pointing at the sidecar URL (or `CONTAINER` with digest-pinned image).

3. **Do not** implement a worker-local subprocess `RuntimeAdapter` in osva-adapters without a core registration story — artifact registration pattern does **not** apply to runtimes today.

**Why not D alone:** MCP connects tools to an agent already running elsewhere. OSVA still needs a **runtime executor** to own RunAttempt lifecycle, timeouts, and output persistence. MCP is complementary (e.g., expose OSVA tools to a CLI), not equivalent.

**Why not A alone:** Violates isolation class L4 intent in [AGENT_RUNTIME.md](https://github.com/Osva-AI/osva/blob/main/docs/platform/AGENT_RUNTIME.md) and expands attack surface on the worker host.

---

## Capability bridge vs CLI-native tools

| Approach                                  | Pros                                                      | Cons                                                                      |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **CLI-native only** (no capability calls) | Simple; uses vendor sandbox; fewer moving parts           | No OSVA tool registry, approvals, or audit on tool calls                  |
| **Bridge OSVA tools via capability HTTP** | Unified tool policy and MCP connectors registered in OSVA | Requires mapping CLI tool/MCP model to capability invoke; vendor-specific |
| **Bridge via MCP server hosted by OSVA**  | Familiar to CLIs                                          | Still not a runtime; double network hop; secret exposure risk             |

**A2.1 default:** CLI-native with read-only or workspace-write sandbox; document capability bridging as A2.5 conformance item.

---

## Synchronous execute vs CLI streaming

Runtime Protocol V1 remote execute is **one HTTP request/response** ([RUNTIME_PROTOCOL_V1.md](https://github.com/Osva-AI/osva/blob/main/docs/contracts/RUNTIME_PROTOCOL_V1.md)). All three CLIs support **streaming stdout** while running.

**Implication:** Sidecar must **buffer** until CLI completion (or failure), then return one JSON `output`. Progressive observability belongs in **sidecar logs** (and future OSVA event export), not execute response streaming — unless core protocol evolves (gap doc).

---

## Implementation feasibility ordering (A2.2–A2.4)

Based on **verified** headless docs, structured output, and CI friendliness — not brand preference:

| Order | Runtime         | Rationale                                                                                     |
| ----- | --------------- | --------------------------------------------------------------------------------------------- |
| 1     | **Gemini CLI**  | Open-source reference; explicit headless + `stream-json` + exit codes in official headless.md |
| 2     | **Codex CLI**   | First-class `codex exec --json` documentation                                                 |
| 3     | **Claude Code** | Mature `-p` / `stream-json`; auth/subscription matrix heavier for automated acceptance        |

⚠️ Pin exact CLI versions in acceptance images when implementing A2.2+; this audit did not pin versions.
