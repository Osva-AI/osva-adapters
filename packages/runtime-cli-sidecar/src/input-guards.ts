import type { JsonValue } from "@osva-ai/contracts";
import { RuntimeExecutionError } from "@osva-ai/sdk/runtime";
import { RUNTIME_PROTOCOL_ERROR_CODES } from "@osva-ai/runtime-protocol";

const UNSUPPORTED_KEYS = new Set([
  "interactiveApproval",
  "humanApproval",
  "approvalPrompt",
]);

export function assertSupportedRunInput(input: JsonValue): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (UNSUPPORTED_KEYS.has(key)) {
      throw new RuntimeExecutionError(
        "Interactive approval flows are not supported by the CLI sidecar.",
        RUNTIME_PROTOCOL_ERROR_CODES.AGENT_EXECUTION_FAILED,
      );
    }
  }
}

export function readDeadlineMs(
  input: JsonValue,
  defaultDeadlineMs: number,
): number {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return defaultDeadlineMs;
  }
  const record = input as Record<string, unknown>;
  const raw = record.deadlineMs;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return defaultDeadlineMs;
  }
  return Math.min(raw, 300_000);
}

export function readWorkingDirectoryHint(input: JsonValue): string | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const cwd = record.cwd;
  return typeof cwd === "string" && cwd.length > 0 ? cwd : undefined;
}
