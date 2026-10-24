export { loadSidecarConfigFromEnv } from "./config.js";
export { ExecutionRegistry } from "./execution-registry.js";
export { assertPathUnderRoot } from "./paths.js";
export { createFixtureCliProvider } from "./providers/fixture-provider.js";
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
