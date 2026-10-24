import type { SidecarConfig } from "../types.js";
import type { CliExecutionProvider } from "../types.js";
import { createClaudeCliProvider } from "./claude-provider.js";
import { createCodexCliProvider } from "./codex-provider.js";
import { createFixtureCliProvider } from "./fixture-provider.js";
import { createGeminiCliProvider } from "./gemini-provider.js";
import {
  type CliProviderKind,
  parseCliProviderKind,
} from "../cli-provider-kind.js";

export interface CreateCliProviderOptions {
  readonly workspaceRoot: string;
  readonly providerKind?: CliProviderKind;
  readonly geminiCommand?: string;
  readonly codexCommand?: string;
  readonly claudeCommand?: string;
  readonly fixtureScriptPath?: string;
}

export function createCliProvider(
  options: CreateCliProviderOptions,
): CliExecutionProvider {
  const kind = options.providerKind ?? "fixture";
  switch (kind) {
    case "fixture":
      return createFixtureCliProvider({
        workspaceRoot: options.workspaceRoot,
        ...(options.fixtureScriptPath !== undefined
          ? { fixtureScriptPath: options.fixtureScriptPath }
          : {}),
      });
    case "gemini":
      return createGeminiCliProvider({
        workspaceRoot: options.workspaceRoot,
        ...(options.geminiCommand !== undefined
          ? { command: options.geminiCommand }
          : {}),
        approvalMode:
          process.env.OSVA_SIDECAR_GEMINI_APPROVAL_MODE ?? "default",
        sandbox: process.env.OSVA_SIDECAR_GEMINI_SANDBOX !== "0",
        skipTrust: process.env.OSVA_SIDECAR_GEMINI_SKIP_TRUST !== "0",
        ...(process.env.OSVA_SIDECAR_GEMINI_MODEL !== undefined
          ? { model: process.env.OSVA_SIDECAR_GEMINI_MODEL }
          : {}),
      });
    case "codex":
      return createCodexCliProvider({
        workspaceRoot: options.workspaceRoot,
        ...(options.codexCommand !== undefined
          ? { command: options.codexCommand }
          : {}),
        sandbox: process.env.OSVA_SIDECAR_CODEX_SANDBOX ?? "read-only",
        skipGitRepoCheck: process.env.OSVA_SIDECAR_CODEX_SKIP_GIT_CHECK !== "0",
        ephemeral: process.env.OSVA_SIDECAR_CODEX_EPHEMERAL === "1",
        ignoreUserConfig:
          process.env.OSVA_SIDECAR_CODEX_IGNORE_USER_CONFIG === "1",
      });
    case "claude":
      return createClaudeCliProvider({
        workspaceRoot: options.workspaceRoot,
        ...(options.claudeCommand !== undefined
          ? { command: options.claudeCommand }
          : {}),
        bare: process.env.OSVA_SIDECAR_CLAUDE_BARE !== "0",
        allowedTools: (() => {
          const raw = process.env.OSVA_SIDECAR_CLAUDE_ALLOWED_TOOLS;
          return raw !== undefined && raw.trim().length > 0
            ? raw.trim()
            : "Read";
        })(),
        ...(process.env.OSVA_SIDECAR_CLAUDE_MAX_BUDGET_USD !== undefined
          ? { maxBudgetUsd: process.env.OSVA_SIDECAR_CLAUDE_MAX_BUDGET_USD }
          : {}),
      });
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled provider kind: ${String(_exhaustive)}`);
    }
  }
}

export function createCliProviderFromSidecarConfig(
  config: SidecarConfig,
): CliExecutionProvider {
  return createCliProvider({
    workspaceRoot: config.workspaceRoot,
    providerKind: config.cliProvider,
    ...(config.geminiCommand !== undefined
      ? { geminiCommand: config.geminiCommand }
      : {}),
    ...(config.codexCommand !== undefined
      ? { codexCommand: config.codexCommand }
      : {}),
    ...(config.claudeCommand !== undefined
      ? { claudeCommand: config.claudeCommand }
      : {}),
    ...(config.fixtureScriptPath !== undefined
      ? { fixtureScriptPath: config.fixtureScriptPath }
      : {}),
  });
}

export function loadCliProviderKindFromEnv(): CliProviderKind {
  return parseCliProviderKind(process.env.OSVA_SIDECAR_CLI_PROVIDER);
}

export { parseCliProviderKind };

const VENDOR_AUTH_ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_API_KEY",
  "CODEX_API_KEY",
  "OPENAI_API_KEY",
  "CODEX_HOME",
  "ANTHROPIC_API_KEY",
] as const;

/** Extend default allowlist with operator-configured vendor auth keys (never from HTTP). */
export function vendorAuthEnvAllowlist(): readonly string[] {
  const extra = process.env.OSVA_SIDECAR_EXTRA_ENV_ALLOWLIST;
  const fromExtra =
    extra !== undefined && extra.length > 0
      ? extra
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  return [...VENDOR_AUTH_ENV_KEYS, ...fromExtra];
}

export function mergeEnvAllowlistForProvider(
  base: readonly string[],
  providerKind: CliProviderKind,
): readonly string[] {
  if (providerKind === "fixture") {
    return base;
  }
  const merged = new Set<string>(base);
  for (const key of vendorAuthEnvAllowlist()) {
    merged.add(key);
  }
  return [...merged];
}
