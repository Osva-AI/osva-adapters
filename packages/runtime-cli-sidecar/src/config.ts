import os from "node:os";
import path from "node:path";
import {
  loadCliProviderKindFromEnv,
  mergeEnvAllowlistForProvider,
} from "./providers/create-cli-provider.js";
import type { SidecarConfig } from "./types.js";

const DEFAULT_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
] as const;

export function loadSidecarConfigFromEnv(
  overrides: Partial<SidecarConfig> = {},
): SidecarConfig {
  const host = overrides.host ?? process.env.OSVA_SIDECAR_HOST ?? "127.0.0.1";
  const port =
    overrides.port ??
    Number.parseInt(process.env.OSVA_SIDECAR_PORT ?? "9321", 10);
  const authSecret =
    overrides.authSecret ?? process.env.OSVA_SIDECAR_AUTH_SECRET;
  const workspaceRoot =
    overrides.workspaceRoot ??
    process.env.OSVA_SIDECAR_WORKSPACE_ROOT ??
    path.join(os.tmpdir(), "osva-cli-sidecar-workspace");

  const cliProvider = overrides.cliProvider ?? loadCliProviderKindFromEnv();
  const baseEnvAllowlist = overrides.envAllowlist ?? DEFAULT_ENV_ALLOWLIST;

  return {
    host,
    port,
    executePath: overrides.executePath ?? "/execute",
    ...(authSecret !== undefined && authSecret.length > 0
      ? { authSecret }
      : {}),
    maxConcurrentExecutions:
      overrides.maxConcurrentExecutions ??
      Number.parseInt(process.env.OSVA_SIDECAR_MAX_CONCURRENT ?? "4", 10),
    defaultDeadlineMs:
      overrides.defaultDeadlineMs ??
      Number.parseInt(
        process.env.OSVA_SIDECAR_DEFAULT_DEADLINE_MS ?? "120000",
        10,
      ),
    maxStdoutBytes:
      overrides.maxStdoutBytes ??
      Number.parseInt(
        process.env.OSVA_SIDECAR_MAX_STDOUT_BYTES ?? "1048576",
        10,
      ),
    maxStderrBytes:
      overrides.maxStderrBytes ??
      Number.parseInt(
        process.env.OSVA_SIDECAR_MAX_STDERR_BYTES ?? "262144",
        10,
      ),
    workspaceRoot,
    envAllowlist: mergeEnvAllowlistForProvider(baseEnvAllowlist, cliProvider),
    cliProvider,
    ...(overrides.geminiCommand !== undefined
      ? { geminiCommand: overrides.geminiCommand }
      : process.env.OSVA_SIDECAR_GEMINI_BINARY !== undefined
        ? { geminiCommand: process.env.OSVA_SIDECAR_GEMINI_BINARY }
        : {}),
    ...(overrides.codexCommand !== undefined
      ? { codexCommand: overrides.codexCommand }
      : process.env.OSVA_SIDECAR_CODEX_BINARY !== undefined
        ? { codexCommand: process.env.OSVA_SIDECAR_CODEX_BINARY }
        : {}),
    ...(overrides.claudeCommand !== undefined
      ? { claudeCommand: overrides.claudeCommand }
      : process.env.OSVA_SIDECAR_CLAUDE_BINARY !== undefined
        ? { claudeCommand: process.env.OSVA_SIDECAR_CLAUDE_BINARY }
        : {}),
    ...(overrides.fixtureScriptPath !== undefined
      ? { fixtureScriptPath: overrides.fixtureScriptPath }
      : process.env.OSVA_SIDECAR_FIXTURE_SCRIPT !== undefined
        ? { fixtureScriptPath: process.env.OSVA_SIDECAR_FIXTURE_SCRIPT }
        : {}),
    completedCacheMaxEntries:
      overrides.completedCacheMaxEntries ??
      Number.parseInt(
        process.env.OSVA_SIDECAR_COMPLETED_CACHE_MAX ?? "512",
        10,
      ),
    completedCacheTtlMs:
      overrides.completedCacheTtlMs ??
      Number.parseInt(
        process.env.OSVA_SIDECAR_COMPLETED_CACHE_TTL_MS ?? "3600000",
        10,
      ),
    ...(overrides.capabilityTimeoutMs !== undefined
      ? { capabilityTimeoutMs: overrides.capabilityTimeoutMs }
      : process.env.OSVA_SIDECAR_CAPABILITY_TIMEOUT_MS !== undefined
        ? {
            capabilityTimeoutMs: Number.parseInt(
              process.env.OSVA_SIDECAR_CAPABILITY_TIMEOUT_MS,
              10,
            ),
          }
        : {}),
    draining: overrides.draining ?? false,
  };
}
