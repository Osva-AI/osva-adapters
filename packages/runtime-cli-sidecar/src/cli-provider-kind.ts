export const CLI_PROVIDER_KINDS = [
  "fixture",
  "gemini",
  "codex",
  "claude",
] as const;

export type CliProviderKind = (typeof CLI_PROVIDER_KINDS)[number];

export function parseCliProviderKind(raw: string | undefined): CliProviderKind {
  const value = (raw ?? "fixture").trim().toLowerCase();
  if ((CLI_PROVIDER_KINDS as readonly string[]).includes(value)) {
    return value as CliProviderKind;
  }
  throw new Error(
    `Unknown OSVA_SIDECAR_CLI_PROVIDER "${raw ?? ""}". Allowed: ${CLI_PROVIDER_KINDS.join(", ")}.`,
  );
}

/** Documented CLI interface versions validated with fixture tests (not live vendor pins). */
export const DOCUMENTED_CLI_VERSIONS = {
  gemini:
    "gemini-cli headless JSON (--output-format json) per upstream headless.md",
  codex: "codex exec --json JSONL per OpenAI non-interactive docs",
  claude: "claude -p --output-format json per code.claude.com headless docs",
} as const;
