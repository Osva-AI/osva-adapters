const SENSITIVE_KEY =
  /^(token|secret|password|api[_-]?key|authorization|credential|capabilities)$/i;

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Redact known sensitive patterns from log strings. */
export function redactSensitiveText(text: string): string {
  let out = text.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  out = out.replace(/("token"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2");
  out = out.replace(/("capabilities"\s*:\s*\{)[^}]+(\})/gi, "$1[REDACTED]$2");
  return out;
}

export function redactJsonForLog(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonForLog(entry));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactJsonForLog(entry);
      }
    }
    return out;
  }
  return value;
}
