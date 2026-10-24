# Gemini CLI adapter (A2.2)

## Invocation

Operator sets `OSVA_SIDECAR_CLI_PROVIDER=gemini`.

The sidecar launches (argv array, no shell):

```text
gemini -p <prompt> --output-format json --approval-mode default --sandbox --skip-trust
```

Optional: `OSVA_SIDECAR_GEMINI_MODEL`, `OSVA_SIDECAR_GEMINI_APPROVAL_MODE` (never `yolo` / `auto_edit`).

## Run input

| Field                 | Supported                            |
| --------------------- | ------------------------------------ |
| `prompt` or `message` | Required non-empty string            |
| `cwd`                 | Optional, confined to workspace root |
| `deadlineMs`          | Optional, capped at 300s             |

Run input **must not** include provider/binary/sandbox override fields.

## Output mapping

Gemini JSON (`response`, optional `stats`, optional `error`) maps to sidecar success output:

```json
{
  "provider": "gemini-cli",
  "response": "<text>",
  "stats": {}
}
```

## Authentication

Operator supplies `GEMINI_API_KEY` / `GOOGLE_API_KEY` via host environment (allowlisted). Keys are not accepted in execute HTTP JSON.

## Security defaults

- `--sandbox` enabled unless `OSVA_SIDECAR_GEMINI_SANDBOX=0`
- Forbidden approval modes (`yolo`, `auto_edit`) rejected at provider construction and in run input
- Container/OS isolation still required for untrusted repos

### `--approval-mode default` deployment note

`default` is the sidecar baseline (not `yolo`). Upstream Gemini may still allow tool execution subject to the CLI policy engine and operator API credentials. **This is not OS-level sandboxing.** Operators running untrusted prompts should combine `--sandbox`, narrow workspace mounts, network egress controls, and separate credentials per trust boundary. Unsupported interactive approval is rejected at the HTTP layer (`interactiveApproval` fields); headless runs rely on wall-clock deadlines and process-tree termination if the CLI blocks.

## Version pinning

Pin the `gemini` CLI in deployment images. Interface validated against upstream [headless.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md).

## Local fixtures

`fixtures/osva-fixture-gemini-cli.mjs` emulates JSON output for hermetic tests.
