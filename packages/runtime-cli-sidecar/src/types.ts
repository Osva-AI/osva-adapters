import type { JsonValue } from "@osva-ai/contracts";

/** Classification for CLI subprocess outcomes (sidecar-local, not wire codes). */
export type CliExecutionClassification =
  | "completed"
  | "timeout"
  | "cancelled"
  | "spawn_error"
  | "invalid_output"
  | "cli_failure";

export interface CliLaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface CliExecutionInput {
  readonly executionId: string;
  readonly runInput: JsonValue;
  readonly workingDirectory: string;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
}

export interface CliExecutionResult {
  readonly classification: CliExecutionClassification;
  readonly outcome: "success" | "failure";
  readonly output?: JsonValue;
  readonly exitCode?: number;
  readonly stderrPreview?: string;
  readonly durationMs: number;
}

/**
 * Injectable CLI backend. Vendor-specific adapters (A2.2+) implement this;
 * A2.1 ships reference + fixture providers only.
 */
export interface CliExecutionProvider {
  readonly providerId: string;
  buildLaunch(input: CliExecutionInput): CliLaunchSpec;
  parseOutput(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    runInput: JsonValue,
  ): CliExecutionResult;
}

import type { CliProviderKind } from "./cli-provider-kind.js";

export interface SidecarConfig {
  readonly host: string;
  readonly port: number;
  readonly executePath: string;
  readonly authSecret?: string;
  readonly maxConcurrentExecutions: number;
  readonly defaultDeadlineMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly workspaceRoot: string;
  readonly envAllowlist: readonly string[];
  readonly completedCacheMaxEntries: number;
  readonly completedCacheTtlMs: number;
  readonly capabilityTimeoutMs?: number;
  readonly draining: boolean;
  /** Operator-selected CLI backend (never from HTTP). */
  readonly cliProvider: CliProviderKind;
  readonly geminiCommand?: string;
  readonly codexCommand?: string;
  readonly claudeCommand?: string;
  readonly fixtureScriptPath?: string;
}

export type SidecarLogEvent =
  | { type: "execution_received"; executionId: string }
  | { type: "cli_started"; executionId: string; providerId: string }
  | {
      type: "cli_completed";
      executionId: string;
      durationMs: number;
    }
  | {
      type: "cli_failed";
      executionId: string;
      classification: CliExecutionClassification;
      durationMs: number;
    }
  | { type: "cli_timed_out"; executionId: string; durationMs: number }
  | { type: "cli_cancelled"; executionId: string; durationMs: number }
  | {
      type: "execution_duplicate_coalesced";
      executionId: string;
    }
  | { type: "sidecar_shutting_down" };

export type SidecarLogger = (event: SidecarLogEvent) => void;
