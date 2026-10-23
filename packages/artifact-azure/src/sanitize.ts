const SECRET_PATTERNS: readonly RegExp[] = [
  /AccountKey=[^;\s]+/gi,
  /SharedAccessSignature=[^;\s]+/gi,
  /DefaultEndpointsProtocol=[^;\s]+;AccountName=[^;\s]+;AccountKey=[^;\s]+/gi,
  /sig=[^&\s]+/gi,
  /se=[^&\s]+/gi,
  /sp=[^&\s]+/gi,
  /sv=[^&\s]+/gi,
  /sr=[^&\s]+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

export function sanitizeExternalMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized;
}
