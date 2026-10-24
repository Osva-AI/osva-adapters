# Codex CLI adapter (A2.3)

## Invocation

Operator sets `OSVA_SIDECAR_CLI_PROVIDER=codex`.

Default argv pattern:

```text
codex exec --skip-git-repo-check --json --sandbox read-only <prompt>
```

Optional flags via env: `OSVA_SIDECAR_CODEX_EPHEMERAL=1`, `OSVA_SIDECAR_CODEX_IGNORE_USER_CONFIG=1`.

Sandbox mode configurable with `OSVA_SIDECAR_CODEX_SANDBOX` (default `read-only`).
`danger-full-access` is **rejected**.

## Run input

Same contract as Gemini adapter (`prompt` / `message`, optional `cwd`, `deadlineMs`).

## JSONL processing

Stdout is parsed as JSONL. The adapter tracks `item.completed` events where `item.type === agent_message` and uses the **last** such message as the user-facing response. Error and `turn.failed` events fail the execution.

## Authentication

Operator-managed `CODEX_API_KEY` / `CODEX_HOME` (allowlisted env). Never forwarded from OSVA capability tokens.

## Git repository check

Sidecar enables `--skip-git-repo-check` by default because workspace roots are often ephemeral. For production repos, set `OSVA_SIDECAR_CODEX_SKIP_GIT_CHECK=0` and mount a git workspace.

## Version pinning

Pin `codex` CLI in deployment images. Interface validated against [non-interactive mode](https://developers.openai.com/codex/noninteractive) documentation.

## Local fixtures

`fixtures/osva-fixture-codex-cli.mjs` emits representative JSONL for tests.
