export interface JsonlParseResult {
  readonly events: readonly unknown[];
  readonly malformedLines: number;
  readonly partialLine?: string;
}

/**
 * Parse newline-delimited JSON from a bounded stdout buffer.
 * Ignores empty lines; records malformed lines without throwing.
 */
export function parseJsonl(
  stdout: string,
  maxEvents = 10_000,
): JsonlParseResult {
  const events: unknown[] = [];
  let malformedLines = 0;
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { events, malformedLines };
  }

  const lines = trimmed.split(/\r?\n/);
  let partialLine: string | undefined;
  if (!stdout.endsWith("\n") && !stdout.endsWith("\r\n")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length > 0) {
      partialLine = last;
      lines.pop();
    }
  }

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    if (events.length >= maxEvents) {
      break;
    }
    try {
      events.push(JSON.parse(line) as unknown);
    } catch {
      malformedLines += 1;
    }
  }

  return {
    events,
    malformedLines,
    ...(partialLine !== undefined ? { partialLine } : {}),
  };
}
