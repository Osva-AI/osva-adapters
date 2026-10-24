import type { JsonValue } from "@osva-ai/contracts";

/** Maximum prompt length forwarded to vendor CLIs (bytes, UTF-8). */
export const MAX_PROMPT_BYTES = 512_000;

const UNSAFE_PROVIDER_KEYS = new Set([
  "command",
  "executable",
  "binary",
  "provider",
  "providerId",
  "sandbox",
  "approvalMode",
  "yolo",
  "dangerouslySkipPermissions",
  "dangerFullAccess",
]);

export class RunInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunInputValidationError";
  }
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Extract the operator-authored prompt from Run input.
 * Security-sensitive execution policy must not be taken from run input.
 */
export function extractPrompt(runInput: JsonValue): string {
  if (
    runInput === null ||
    typeof runInput !== "object" ||
    Array.isArray(runInput)
  ) {
    throw new RunInputValidationError(
      "Run input must be a JSON object with a non-empty prompt field.",
    );
  }
  const record = runInput as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (UNSAFE_PROVIDER_KEYS.has(key)) {
      throw new RunInputValidationError(
        `Run input field "${key}" cannot override sidecar execution policy.`,
      );
    }
  }
  const prompt =
    typeof record.prompt === "string"
      ? record.prompt
      : typeof record.message === "string"
        ? record.message
        : undefined;
  if (prompt === undefined || prompt.trim().length === 0) {
    throw new RunInputValidationError(
      "Run input must include a non-empty prompt or message string.",
    );
  }
  if (utf8ByteLength(prompt) > MAX_PROMPT_BYTES) {
    throw new RunInputValidationError(
      "Run input prompt exceeds maximum allowed size.",
    );
  }
  return prompt;
}
