import type { JsonValue } from "@osva-ai/contracts";
import { assertPathUnderRoot } from "../paths.js";
import type {
  CliExecutionInput,
  CliExecutionProvider,
  CliExecutionResult,
  CliLaunchSpec,
} from "../types.js";
import { parseJsonl } from "./shared/jsonl.js";
import {
  failureResult,
  previewStderr,
  successResult,
} from "./shared/parse-helpers.js";
import {
  assertCodexSandboxMode,
  rejectUnsafeRunInputOverrides,
} from "./shared/sandbox-policy.js";
import { extractPrompt } from "./shared/run-input.js";

export interface CodexCliProviderOptions {
  readonly workspaceRoot: string;
  readonly command?: string;
  readonly sandbox?: string;
  readonly skipGitRepoCheck?: boolean;
  readonly ephemeral?: boolean;
  readonly ignoreUserConfig?: boolean;
}

function extractCodexFinalMessage(events: readonly unknown[]): {
  message?: string;
  usage?: JsonValue;
  errorMessage?: string;
} {
  let message: string | undefined;
  let usage: JsonValue | undefined;
  let errorMessage: string | undefined;

  for (const event of events) {
    if (event === null || typeof event !== "object") {
      continue;
    }
    const record = event as Record<string, unknown>;
    const type = record.type;
    if (type === "error") {
      const msg =
        typeof record.message === "string"
          ? record.message
          : JSON.stringify(record).slice(0, 200);
      errorMessage = msg;
    }
    if (type === "turn.failed") {
      errorMessage =
        typeof record.message === "string"
          ? record.message
          : "Codex turn failed.";
    }
    if (type === "turn.completed" && record.usage !== undefined) {
      usage = record.usage as JsonValue;
    }
    if (type === "item.completed") {
      const item = record.item;
      if (item !== null && typeof item === "object") {
        const itemRecord = item as Record<string, unknown>;
        if (
          itemRecord.type === "agent_message" &&
          typeof itemRecord.text === "string"
        ) {
          message = itemRecord.text;
        }
      }
    }
  }

  const out: {
    message?: string;
    usage?: JsonValue;
    errorMessage?: string;
  } = {};
  if (message !== undefined) {
    out.message = message;
  }
  if (usage !== undefined) {
    out.usage = usage;
  }
  if (errorMessage !== undefined) {
    out.errorMessage = errorMessage;
  }
  return out;
}

export function createCodexCliProvider(
  options: CodexCliProviderOptions,
): CliExecutionProvider {
  const command = options.command ?? "codex";
  const sandbox = options.sandbox ?? "read-only";
  assertCodexSandboxMode(sandbox);

  return {
    providerId: "codex-cli",
    buildLaunch(input: CliExecutionInput): CliLaunchSpec {
      rejectUnsafeRunInputOverrides(input.runInput);
      const prompt = extractPrompt(input.runInput);
      const cwd = assertPathUnderRoot(
        options.workspaceRoot,
        input.workingDirectory,
      );
      const args = ["exec"];
      if (options.skipGitRepoCheck !== false) {
        args.push("--skip-git-repo-check");
      }
      if (options.ephemeral === true) {
        args.push("--ephemeral");
      }
      if (options.ignoreUserConfig === true) {
        args.push("--ignore-user-config");
      }
      args.push("--json", "--sandbox", sandbox, prompt);
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
      const { events, malformedLines, partialLine } = parseJsonl(stdout);
      const { message, usage, errorMessage } = extractCodexFinalMessage(events);

      if (errorMessage !== undefined) {
        return failureResult(
          "cli_failure",
          errorMessage || stderrPreview,
          exitCode,
        );
      }

      if (message !== undefined && message.length > 0) {
        const parseWarnings: Record<string, JsonValue> = {};
        if (malformedLines > 0) {
          parseWarnings.malformedJsonlLines = malformedLines;
        }
        if (partialLine !== undefined) {
          parseWarnings.partialTrailingLine = true;
        }
        return successResult("codex-cli", {
          response: message,
          usage,
          ...(Object.keys(parseWarnings).length > 0 ? { parseWarnings } : {}),
        });
      }

      if (exitCode !== 0 && exitCode !== null) {
        return failureResult("cli_failure", stderrPreview, exitCode);
      }

      if (events.length === 0) {
        return failureResult("invalid_output", stderrPreview, exitCode);
      }

      return failureResult(
        "invalid_output",
        stderrPreview ||
          "Codex JSONL stream did not contain a final agent message.",
        exitCode,
      );
    },
  };
}
