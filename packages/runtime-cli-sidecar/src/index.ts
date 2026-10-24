export { loadSidecarConfigFromEnv } from "./config.js";
export { ExecutionRegistry } from "./execution-registry.js";
export { assertPathUnderRoot } from "./paths.js";
export { createClaudeCliProvider } from "./providers/claude-provider.js";
export { createCodexCliProvider } from "./providers/codex-provider.js";
export {
  createCliProvider,
  createCliProviderFromSidecarConfig,
  loadCliProviderKindFromEnv,
} from "./providers/create-cli-provider.js";
export { createFixtureCliProvider } from "./providers/fixture-provider.js";
export { createGeminiCliProvider } from "./providers/gemini-provider.js";
export {
  CLI_PROVIDER_KINDS,
  DOCUMENTED_CLI_VERSIONS,
  type CliProviderKind,
} from "./cli-provider-kind.js";
export { redactSensitiveText, redactJsonForLog } from "./redact.js";
export {
  createCliSidecar,
  type CliSidecar,
  type CliSidecarOptions,
} from "./sidecar.js";
export type {
  CliExecutionClassification,
  CliExecutionInput,
  CliExecutionProvider,
  CliExecutionResult,
  CliLaunchSpec,
  SidecarConfig,
  SidecarLogEvent,
  SidecarLogger,
} from "./types.js";
