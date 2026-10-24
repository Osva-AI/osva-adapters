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
  assertGeminiApprovalMode,
  rejectUnsafeRunInputOverrides,
} from "./shared/sandbox-policy.js";
import { extractPrompt, RunInputValidationError } from "./shared/run-input.js";

export interface GeminiCliProviderOptions {
  readonly workspaceRoot: string;
  /** Allowlisted binary name or absolute path configured by operator. */
  readonly command?: string;
  readonly approvalMode?: string;
  readonly sandbox?: boolean;
  readonly skipTrust?: boolean;
  readonly model?: string;
}

function parseGeminiJson(stdout: string): {
  response?: string;
  stats?: JsonValue;
  error?: JsonValue;
} {
  const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
  const out: {
    response?: string;
    stats?: JsonValue;
    error?: JsonValue;
  } = {};
  if (typeof parsed.response === "string") {
    out.response = parsed.response;
  }
  if (parsed.stats !== undefined && parsed.stats !== null) {
    out.stats = parsed.stats as JsonValue;
  }
  if (parsed.error !== undefined && parsed.error !== null) {
    out.error = parsed.error as JsonValue;
  }
  return out;
}

export function createGeminiCliProvider(
  options: GeminiCliProviderOptions,
): CliExecutionProvider {
  const command = options.command ?? "gemini";
  const approvalMode = options.approvalMode ?? "default";
  assertGeminiApprovalMode(approvalMode);

  return {
    providerId: "gemini-cli",
    buildLaunch(input: CliExecutionInput): CliLaunchSpec {
      rejectUnsafeRunInputOverrides(input.runInput);
      const prompt = extractPrompt(input.runInput);
      const cwd = assertPathUnderRoot(
        options.workspaceRoot,
        input.workingDirectory,
      );
      const args = [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--approval-mode",
        approvalMode,
      ];
      if (options.sandbox !== false) {
        args.push("--sandbox");
      }
      if (options.skipTrust !== false) {
        args.push("--skip-trust");
      }
      if (options.model !== undefined && options.model.length > 0) {
        args.push("--model", options.model);
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
      if (exitCode !== 0 && exitCode !== null) {
        return failureResult("cli_failure", stderrPreview, exitCode);
      }
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        return failureResult("invalid_output", stderrPreview, exitCode);
      }
      let parsed: ReturnType<typeof parseGeminiJson>;
      try {
        parsed = parseGeminiJson(trimmed);
      } catch {
        return failureResult("invalid_output", stderrPreview, exitCode);
      }
      if (parsed.error !== undefined) {
        return failureResult(
          "cli_failure",
          stderrPreview || JSON.stringify(parsed.error).slice(0, 500),
          exitCode,
        );
      }
      if (parsed.response === undefined || parsed.response.length === 0) {
        return failureResult("invalid_output", stderrPreview, exitCode);
      }
      return successResult("gemini-cli", {
        response: parsed.response,
        stats: parsed.stats,
      });
    },
  };
}

export function isGeminiLaunchValidationError(
  error: unknown,
): error is RunInputValidationError {
  return error instanceof RunInputValidationError;
}
