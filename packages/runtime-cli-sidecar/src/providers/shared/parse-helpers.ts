import type { JsonValue } from "@osva-ai/contracts";
import type { CliExecutionResult } from "../../types.js";

export function successResult(
  providerId: string,
  payload: Record<string, JsonValue | undefined>,
): CliExecutionResult {
  const output: Record<string, JsonValue> = { provider: providerId };
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return {
    classification: "completed",
    outcome: "success",
    output,
    durationMs: 0,
  };
}

export function failureResult(
  classification: CliExecutionResult["classification"],
  stderrPreview?: string,
  exitCode?: number | null,
): CliExecutionResult {
  return {
    classification,
    outcome: "failure",
    ...(exitCode !== undefined && exitCode !== null ? { exitCode } : {}),
    ...(stderrPreview !== undefined && stderrPreview.length > 0
      ? { stderrPreview: stderrPreview.slice(0, 500) }
      : {}),
    durationMs: 0,
  };
}

export function previewStderr(stderr: string, maxChars = 500): string {
  const trimmed = stderr.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.length <= maxChars
    ? trimmed
    : `${trimmed.slice(0, maxChars)}…`;
}
