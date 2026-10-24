import type { JsonValue } from "@osva-ai/contracts";
import { assertPathUnderRoot } from "../paths.js";
import type {
  CliExecutionInput,
  CliExecutionProvider,
  CliExecutionResult,
  CliLaunchSpec,
} from "../types.js";
import {
  failureResult,
  previewStderr,
  successResult,
} from "./shared/parse-helpers.js";
import {
  assertClaudeAllowedTools,
  rejectUnsafeRunInputOverrides,
} from "./shared/sandbox-policy.js";
import { extractPrompt } from "./shared/run-input.js";

export interface ClaudeCliProviderOptions {
  readonly workspaceRoot: string;
  readonly command?: string;
  readonly bare?: boolean;
  readonly allowedTools?: string;
  readonly maxBudgetUsd?: string;
}

function parseClaudeJson(stdout: string): {
  result?: string;
  structuredOutput?: JsonValue;
  isError?: boolean;
  error?: string;
  sessionId?: string;
  totalCostUsd?: number;
} {
  const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
  const out: {
    result?: string;
    structuredOutput?: JsonValue;
    isError?: boolean;
    error?: string;
    sessionId?: string;
    totalCostUsd?: number;
  } = {};
  if (typeof parsed.result === "string") {
    out.result = parsed.result;
  }
  if (parsed.structured_output !== undefined) {
    out.structuredOutput = parsed.structured_output as JsonValue;
  }
  if (parsed.is_error === true) {
    out.isError = true;
  }
  if (typeof parsed.error === "string") {
    out.error = parsed.error;
  }
  if (typeof parsed.session_id === "string") {
    out.sessionId = parsed.session_id;
  }
  if (typeof parsed.total_cost_usd === "number") {
    out.totalCostUsd = parsed.total_cost_usd;
  }
  return out;
}

export function createClaudeCliProvider(
  options: ClaudeCliProviderOptions,
): CliExecutionProvider {
  const command = options.command ?? "claude";
  const allowedTools = options.allowedTools ?? "Read";
  assertClaudeAllowedTools(allowedTools);

  return {
    providerId: "claude-code-cli",
    buildLaunch(input: CliExecutionInput): CliLaunchSpec {
      rejectUnsafeRunInputOverrides(input.runInput);
      const prompt = extractPrompt(input.runInput);
      const cwd = assertPathUnderRoot(
        options.workspaceRoot,
        input.workingDirectory,
      );
      const args: string[] = [];
      if (options.bare !== false) {
        args.push("--bare");
      }
      args.push("-p", prompt, "--output-format", "json");
      if (allowedTools.length > 0) {
        args.push("--allowedTools", allowedTools);
      }
      if (
        options.maxBudgetUsd !== undefined &&
        options.maxBudgetUsd.length > 0
      ) {
        args.push("--max-budget-usd", options.maxBudgetUsd);
      }
      return {
        command,
        args,
        cwd,
        env: {},
      };
    },
    parseOutput(
      stdout: string,
      stderr: string,
      exitCode: number | null,
    ): CliExecutionResult {
      const stderrPreview = previewStderr(stderr);
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        if (exitCode !== 0 && exitCode !== null) {
          return failureResult("cli_failure", stderrPreview, exitCode);
        }
        return failureResult("invalid_output", stderrPreview, exitCode);
      }

      let parsed: ReturnType<typeof parseClaudeJson>;
      try {
        parsed = parseClaudeJson(trimmed);
      } catch {
        return failureResult("invalid_output", stderrPreview, exitCode);
      }

      if (parsed.isError || parsed.error !== undefined) {
        return failureResult(
          "cli_failure",
          parsed.error ?? stderrPreview,
          exitCode,
        );
      }

      if (parsed.result !== undefined && parsed.result.length > 0) {
        return successResult("claude-code-cli", {
          response: parsed.result,
          structuredOutput: parsed.structuredOutput,
          sessionId: parsed.sessionId,
          ...(parsed.totalCostUsd !== undefined
            ? { totalCostUsd: parsed.totalCostUsd }
            : {}),
        });
      }

      if (parsed.structuredOutput !== undefined) {
        return successResult("claude-code-cli", {
          response: JSON.stringify(parsed.structuredOutput),
          structuredOutput: parsed.structuredOutput,
          sessionId: parsed.sessionId,
        });
      }

      if (exitCode !== 0 && exitCode !== null) {
        return failureResult("cli_failure", stderrPreview, exitCode);
      }

      return failureResult("invalid_output", stderrPreview, exitCode);
    },
  };
}
