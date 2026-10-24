import { createHash } from "node:crypto";
import type { JsonValue } from "@osva-ai/contracts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Fingerprint run input for duplicate executionId conflict detection. */
export function fingerprintRunInput(input: JsonValue): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}
