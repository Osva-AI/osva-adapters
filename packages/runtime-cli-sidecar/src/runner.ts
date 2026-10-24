import { spawn } from "node:child_process";
import type { JsonValue } from "@osva-ai/contracts";
import { mergeProviderEnv, buildChildEnvironment } from "./env-filter.js";
import { killProcessTree } from "./process-tree.js";
import { RunInputValidationError } from "./providers/shared/run-input.js";
import type {
  CliExecutionInput,
  CliExecutionProvider,
  CliExecutionResult,
  SidecarConfig,
  SidecarLogger,
} from "./types.js";

function previewStderr(stderr: string, maxChars = 500): string {
  const trimmed = stderr.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.length <= maxChars
    ? trimmed
    : `${trimmed.slice(0, maxChars)}…`;
}

async function collectStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ data: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;

  return await new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (truncated) {
        return;
      }
      const remaining = maxBytes - total;
      if (buffer.length <= remaining) {
        chunks.push(buffer);
        total += buffer.length;
      } else {
        chunks.push(buffer.subarray(0, remaining));
        total = maxBytes;
        truncated = true;
      }
    };

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("error", onError);
      stream.off("end", onEnd);
      signal.removeEventListener("abort", onAbort);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      resolve({
        data: Buffer.concat(chunks).toString("utf8"),
        truncated,
      });
    };

    const onAbort = () => {
      cleanup();
      resolve({ data: "", truncated: false });
    };

    stream.on("data", onData);
    stream.on("error", onError);
    stream.on("end", onEnd);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runCliExecution(
  provider: CliExecutionProvider,
  config: SidecarConfig,
  input: CliExecutionInput,
  log: SidecarLogger,
): Promise<CliExecutionResult> {
  const startedAt = Date.now();
  let launch;
  try {
    launch = provider.buildLaunch(input);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message =
      error instanceof RunInputValidationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Invalid CLI launch configuration.";
    log({
      type: "cli_failed",
      executionId: input.executionId,
      classification: "cli_failure",
      durationMs,
    });
    return {
      classification: "cli_failure",
      outcome: "failure",
      stderrPreview: message.slice(0, 500),
      durationMs,
    };
  }
  const baseEnv = buildChildEnvironment(config.envAllowlist);
  const env = mergeProviderEnv(baseEnv, launch.env);

  log({
    type: "cli_started",
    executionId: input.executionId,
    providerId: provider.providerId,
  });

  let child: ReturnType<typeof spawn> | undefined;
  const localAbort = new AbortController();
  const linkedAbort = () => {
    localAbort.abort();
    if (child?.pid !== undefined) {
      killProcessTree(child.pid);
    }
  };
  if (input.signal.aborted) {
    linkedAbort();
  } else {
    input.signal.addEventListener("abort", linkedAbort, { once: true });
  }

  let deadlineExpired = false;
  const deadlineTimer = setTimeout(() => {
    deadlineExpired = true;
    linkedAbort();
  }, input.deadlineMs);

  try {
    child = spawn(launch.command, [...launch.args], {
      cwd: launch.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
  } catch (error) {
    clearTimeout(deadlineTimer);
    const durationMs = Date.now() - startedAt;
    log({
      type: "cli_failed",
      executionId: input.executionId,
      classification: "spawn_error",
      durationMs,
    });
    return {
      classification: "spawn_error",
      outcome: "failure",
      stderrPreview:
        error instanceof Error ? error.message : "Failed to spawn CLI process.",
      durationMs,
    };
  }

  if (child.pid === undefined) {
    clearTimeout(deadlineTimer);
    const durationMs = Date.now() - startedAt;
    log({
      type: "cli_failed",
      executionId: input.executionId,
      classification: "spawn_error",
      durationMs,
    });
    return {
      classification: "spawn_error",
      outcome: "failure",
      durationMs,
    };
  }

  const stdoutPromise = collectStream(
    child.stdout!,
    config.maxStdoutBytes,
    localAbort.signal,
  );
  const stderrPromise = collectStream(
    child.stderr!,
    config.maxStderrBytes,
    localAbort.signal,
  );

  const exitCode = await new Promise<number | null>((resolve) => {
    child!.on("error", () => resolve(null));
    child!.on("close", (code) => resolve(code));
  });

  clearTimeout(deadlineTimer);
  input.signal.removeEventListener("abort", linkedAbort);

  let stdout = "";
  let stderr = "";
  stdout = (await stdoutPromise).data;
  stderr = (await stderrPromise).data;

  const durationMs = Date.now() - startedAt;

  if (deadlineExpired) {
    log({
      type: "cli_timed_out",
      executionId: input.executionId,
      durationMs,
    });
    return {
      classification: "timeout",
      outcome: "failure",
      durationMs,
      stderrPreview: previewStderr(stderr),
    };
  }

  if (input.signal.aborted || localAbort.signal.aborted) {
    log({
      type: "cli_cancelled",
      executionId: input.executionId,
      durationMs,
    });
    return {
      classification: "cancelled",
      outcome: "failure",
      durationMs,
      stderrPreview: previewStderr(stderr),
    };
  }
  const parsed = provider.parseOutput(
    stdout,
    stderr,
    exitCode,
    input.runInput as JsonValue,
  );
  const result: CliExecutionResult = {
    ...parsed,
    durationMs,
    stderrPreview: parsed.stderrPreview ?? previewStderr(stderr),
  };

  if (result.outcome === "success") {
    log({
      type: "cli_completed",
      executionId: input.executionId,
      durationMs,
    });
  } else {
    log({
      type: "cli_failed",
      executionId: input.executionId,
      classification: result.classification,
      durationMs,
    });
  }

  return result;
}
