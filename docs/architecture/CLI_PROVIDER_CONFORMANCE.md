# CLI provider conformance (A2.2–A2.4)

All vendors implement the same `CliExecutionProvider` port and produce Runtime Protocol V1 success/failure envelopes via the shared sidecar.

## Provider selection

| `OSVA_SIDECAR_CLI_PROVIDER` | Backend                              |
| --------------------------- | ------------------------------------ |
| `fixture`                   | A2.1 deterministic fixture (default) |
| `gemini`                    | Gemini CLI                           |
| `codex`                     | Codex CLI                            |
| `claude`                    | Claude Code CLI                      |

Selection is **operator configuration only**. HTTP execute payloads cannot change provider or binary.

## Shared run input

- Required: `prompt` or `message`
- Optional: `cwd` (under workspace root), `deadlineMs`
- Rejected: interactive approval fields, policy override keys (`provider`, `command`, `sandbox`, …)

## Shared success output shape

```json
{
  "provider": "<provider-id>",
  "response": "<primary text>",
  "...": "vendor-specific optional metadata"
}
```

## Conformance tests

`packages/runtime-cli-sidecar/test/conformance.test.ts` runs a scenario matrix against fixture-backed Gemini, Codex, and Claude CLIs (real subprocesses, no vendor APIs).

## Replay / deduplication

A2.1 semantics unchanged:

- Same `executionId` + identical input → coalesce / cache hit
- Same `executionId` + different input → `RUNTIME_PROTOCOL_FAILURE`
- Restart clears in-memory state

## Live vs hermetic

| Mode              | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| Hermetic fixtures | Default CI (`pnpm --filter @osva-ai/runtime-cli-sidecar test`) |
| Live vendor CLI   | Operator opt-in with real credentials (not run in default CI)  |
