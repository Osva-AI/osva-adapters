import type { JsonValue } from "@osva-ai/contracts";
import { RunInputValidationError } from "./run-input.js";

const FORBIDDEN_GEMINI_APPROVAL = new Set(["yolo", "auto_edit"]);
const FORBIDDEN_CODEX_SANDBOX = new Set([
  "danger-full-access",
  "danger_full_access",
]);

export function assertClaudeAllowedTools(tools: string): void {
  if (tools.trim().length === 0) {
    throw new RunInputValidationError(
      "Claude allowedTools must be a non-empty operator-configured allowlist.",
    );
  }
}

export function assertGeminiApprovalMode(mode: string): void {
  if (FORBIDDEN_GEMINI_APPROVAL.has(mode.toLowerCase())) {
    throw new RunInputValidationError(
      `Gemini approval mode "${mode}" is not permitted by the sidecar.`,
    );
  }
}

export function assertCodexSandboxMode(mode: string): void {
  if (FORBIDDEN_CODEX_SANDBOX.has(mode.toLowerCase())) {
    throw new RunInputValidationError(
      `Codex sandbox mode "${mode}" is not permitted by the sidecar.`,
    );
  }
}

export function rejectUnsafeRunInputOverrides(runInput: JsonValue): void {
  if (
    runInput === null ||
    typeof runInput !== "object" ||
    Array.isArray(runInput)
  ) {
    return;
  }
  const record = runInput as Record<string, unknown>;
  const geminiMode = record.geminiApprovalMode;
  if (typeof geminiMode === "string") {
    assertGeminiApprovalMode(geminiMode);
  }
  const codexSandbox = record.codexSandbox;
  if (typeof codexSandbox === "string") {
    assertCodexSandboxMode(codexSandbox);
  }
  if (record.dangerouslySkipPermissions === true) {
    throw new RunInputValidationError(
      "dangerouslySkipPermissions is not supported by the CLI sidecar.",
    );
  }
}
