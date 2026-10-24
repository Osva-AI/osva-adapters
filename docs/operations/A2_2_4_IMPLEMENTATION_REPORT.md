# A2.2–A2.4 implementation report

**Branch:** `feat/a2-2-4-cli-providers`
**Date:** 2026-10-25
**Status:** READY (offline acceptance criteria)

## Stage 0 — Architecture audit (complete)

- Reused A2.1 `CliExecutionProvider`, `runCliExecution`, `ExecutionRegistry`, SDK `createRuntimeHandler`.
- Added operator-selected provider kind via `OSVA_SIDECAR_CLI_PROVIDER` (`fixture` | `gemini` | `codex` | `claude`).
- Vendor auth via env allowlist extensions (`GEMINI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, etc.) — never from HTTP body.
- Documented CLI interfaces (not live version pins): see `DOCUMENTED_CLI_VERSIONS` in `@osva-ai/runtime-cli-sidecar`.

## Stage 1 — Shared design (complete)

| Module                                       | Role                                          |
| -------------------------------------------- | --------------------------------------------- |
| `src/cli-provider-kind.ts`                   | Provider enum + parse                         |
| `src/providers/create-cli-provider.ts`       | Factory + env allowlist merge                 |
| `src/providers/shared/run-input.ts`          | Prompt extraction + policy override rejection |
| `src/providers/shared/jsonl.ts`              | Bounded Codex JSONL parser                    |
| `src/providers/shared/sandbox-policy.ts`     | Reject yolo / danger-full-access              |
| `src/providers/validate-provider-startup.ts` | Binary reachability probe at startup          |

## Stage 2 — Gemini (A2.2)

- `createGeminiCliProvider`: `gemini -p … --output-format json --approval-mode default --sandbox --skip-trust`
- Parses `{ response, stats, error }` JSON envelope.
- Hermetic fixture: `fixtures/osva-fixture-gemini-cli.mjs`

## Stage 3 — Codex (A2.3)

- `createCodexCliProvider`: `codex exec --skip-git-repo-check --json --sandbox read-only <prompt>`
- JSONL aggregation selects last `item.completed` / `agent_message` (not last arbitrary line).
- Hermetic fixture: `fixtures/osva-fixture-codex-cli.mjs`

## Stage 4 — Claude (A2.4)

- `createClaudeCliProvider`: `claude --bare -p … --output-format json --allowedTools Read` (operator-configurable)
- Parses `{ result, structured_output, is_error }`.
- Hermetic fixture: `fixtures/osva-fixture-claude-cli.mjs`

## Stage 5 — Conformance (complete)

- `test/conformance.test.ts` — shared matrix across three vendors + A2.1 fixture regression.
- `test/security.test.ts` — negative cases (policy overrides, auth, redaction).

## Stage 6 — Security audit (complete)

- Verified `shell: false`, argv-only launch, workspace root confinement, env allowlist, no capability token forwarding.
- Run input cannot select provider, binary, or unsafe sandbox modes.
- Path escape now maps to `AGENT_EXECUTION_FAILED` (sidecar execute path).

## Stage 7 — External npm consumer (complete)

- `node scripts/acceptance/a2-2-4-pack-consumer.mjs` — **PASS** (2026-10-25, Windows)
- Installs packed tarball outside workspace; imports public exports; exercises all three providers with tarball fixtures.

## Stage 8 — SDK / protocol interop (complete)

- Sidecar uses `@osva-ai/sdk/runtime` handler (unchanged).
- `test/sdk-interop.test.ts` — HTTP execute with protocol-shaped bodies — **PASS**

## Stage 9 — Documentation (complete)

See `docs/architecture/GEMINI_CLI_ADAPTER.md`, `CODEX_CLI_ADAPTER.md`, `CLAUDE_CLI_ADAPTER.md`, `CLI_PROVIDER_CONFORMANCE.md`, updated sidecar README and design/security docs.

## Stage 10 — Verification matrix

| Check               | Gemini        | Codex       | Claude      |
| ------------------- | ------------- | ----------- | ----------- |
| Lint                | PASS          | PASS        | PASS        |
| Typecheck           | PASS          | PASS        | PASS        |
| Build               | PASS          | PASS        | PASS        |
| Parser tests        | PASS          | PASS        | PASS        |
| Subprocess tests    | PASS          | PASS        | PASS        |
| Protocol HTTP tests | PASS          | PASS        | PASS        |
| Security tests      | PASS (shared) | PASS        | PASS        |
| External consumer   | PASS          | PASS        | PASS        |
| Live vendor API     | **NOT RUN**   | **NOT RUN** | **NOT RUN** |

### Commands executed

```bash
pnpm --filter @osva-ai/runtime-cli-sidecar lint
pnpm --filter @osva-ai/runtime-cli-sidecar typecheck
pnpm --filter @osva-ai/runtime-cli-sidecar build
pnpm --filter @osva-ai/runtime-cli-sidecar test
node scripts/acceptance/a2-2-4-pack-consumer.mjs
```

### Live test policy

No real Gemini/Codex/Claude credentials were used. Opt-in smoke (operator):

```bash
export OSVA_SIDECAR_CLI_PROVIDER=gemini   # or codex | claude
export OSVA_SIDECAR_WORKSPACE_ROOT=/path/to/trusted/git/workspace
# Configure vendor auth via env (GEMINI_API_KEY / CODEX_API_KEY / ANTHROPIC_API_KEY)
osva-runtime-cli-sidecar
```

## Known limitations

- No durable cross-replica deduplication (A2.1 semantics preserved).
- Codex defaults include `--skip-git-repo-check` for sidecar workspaces that may not be git repos; use git-backed workspaces in production when policy requires Codex git guard.
- Vendor CLI version pinning is operator responsibility (OCI image / package manager pin).
- Multi-tenant isolation requires separate sidecar instances per security boundary.

## A2.5 prerequisites

- Compose/worker + sidecar deployment acceptance
- Opt-in live vendor integration job
- Feature matrix hardening with pinned CLI versions in CI images

## Dependency and subprocess gate (2026-10-25)

### DEP0190

- **Origin:** `spawnSync(pnpm|npm, args, { shell: true })` in pack-consumer harness on Windows (`a2-2-4-pack-consumer.mjs`, same pattern in `a2-1-pack-consumer.mjs`).
- **Not from:** `@osva-ai/runtime-cli-sidecar` vendor CLI spawn (`runner.ts` uses `shell: false`).
- **Fix:** `scripts/acceptance/lib/spawn-package-manager.mjs` invokes Node-shipped `npm-cli.js` / Corepack `pnpm.js` via `process.execPath` with `shell: false`. Regression: `spawn-package-manager.test.mjs`.

### npm audit (isolated consumer)

- **5× high** — single advisory chain: **GHSA-mrhx-c7xc-m3w5** (`zod` `<4.6.6`, installed `4.6.5` via `@osva-ai/contracts@1.1.0-rc.3` → `@osva-ai/sdk`, `@osva-ai/runtime-protocol`, sidecar).
- **Remediation owner:** OSVA core npm packages (pin `zod@>=4.6.6` in `@osva-ai/contracts` and republish RC). Not fixable in osva-adapters without upgrading off `1.1.0-rc.3`.
- **Exposure:** Validation-time memory exhaustion (DoS) on untrusted execute payloads hitting SDK Zod paths — not arbitrary code execution. Mitigate with auth on `/execute`, body size limits (protocol max), and network isolation.

## Pre-commit audit (2026-10-25)

- **Git scope vs `origin/main`:** 14 tracked sidecar/root doc files + untracked A2.2–A2.4 sources/fixtures/tests/scripts. Many other `git status` `M` entries show **no diff vs `origin/main`** (line-ending/stat noise on Windows); exclude from PR staging.
- **Correction:** Claude `OSVA_SIDECAR_CLAUDE_ALLOWED_TOOLS=""` no longer omits `--allowedTools`; empty allowlist fails closed at provider construction.
- **Child-process vs OS sandbox:** Documented explicitly in CLI_SIDECAR_SECURITY and Gemini adapter doc.

## Recommendation

**READY** for PR review against offline acceptance criteria. Live vendor authentication remains operator-verified post-merge.
