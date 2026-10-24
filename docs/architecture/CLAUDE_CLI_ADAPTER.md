# Claude Code CLI adapter (A2.4)

## Invocation

Operator sets `OSVA_SIDECAR_CLI_PROVIDER=claude`.

Default argv pattern:

```text
claude --bare -p <prompt> --output-format json --allowedTools Read
```

Configure tools with `OSVA_SIDECAR_CLAUDE_ALLOWED_TOOLS` (comma-separated).
An empty or whitespace-only value is rejected at provider startup (defaults to `Read`).
Omitting `--allowedTools` is never used as a “allow all tools” shortcut.
`--bare` disables host/project auto-discovery unless `OSVA_SIDECAR_CLAUDE_BARE=0`.

## Run input

Same prompt/`cwd`/`deadlineMs` contract as other vendors. Interactive approval fields rejected by sidecar.

## Output mapping

Parses Claude JSON output:

- Primary text: `result`
- Optional structured payload: `structured_output`
- Errors: `is_error` / non-zero exit

Sidecar success envelope:

```json
{
  "provider": "claude-code-cli",
  "response": "<text>",
  "structuredOutput": {}
}
```

## Authentication

Use `ANTHROPIC_API_KEY` in environment for `--bare` headless runs. OAuth/subscription paths are operator-managed on the host filesystem — not exposed via execute JSON.

## Security

- No `--dangerously-skip-permissions`
- Tool allowlist is operator-controlled via env, not run input
- Headless runs should use `--bare` to avoid loading unreviewed MCP/hooks from user home

## Version pinning

Pin Claude Code CLI in deployment images. Interface validated against [headless documentation](https://code.claude.com/docs/en/headless).

## Local fixtures

`fixtures/osva-fixture-claude-cli.mjs` for hermetic tests.
