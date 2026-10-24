import http from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { JsonValue } from "@osva-ai/contracts";
import {
  RUNTIME_PROTOCOL_ERROR_CODES,
  RUNTIME_PROTOCOL_MAX_BODY_BYTES,
  RUNTIME_PROTOCOL_VERSION,
  type RuntimeExecuteResponse,
} from "@osva-ai/runtime-protocol";
import {
  createRuntime,
  createRuntimeHandler,
  RuntimeExecutionError,
  RuntimeProtocolError,
} from "@osva-ai/sdk/runtime";
import { fingerprintRunInput } from "./execution-fingerprint.js";
import {
  ExecutionIdentityConflictError,
  ExecutionRegistry,
} from "./execution-registry.js";
import {
  assertSupportedRunInput,
  readDeadlineMs,
  readWorkingDirectoryHint,
} from "./input-guards.js";
import { assertPathUnderRoot } from "./paths.js";
import { redactJsonForLog } from "./redact.js";
import { runCliExecution } from "./runner.js";
import type {
  CliExecutionProvider,
  SidecarConfig,
  SidecarLogger,
} from "./types.js";

export interface CliSidecarOptions {
  readonly provider: CliExecutionProvider;
  readonly config: SidecarConfig;
  readonly logger?: SidecarLogger;
}

export interface CliSidecar {
  readonly server: Server;
  readonly registry: ExecutionRegistry;
  readonly config: SidecarConfig;
  listen(): Promise<void>;
  /** Stop accepting new work; in-flight executions may continue until close(). */
  beginDraining(): void;
  close(): Promise<void>;
}

function defaultLogger(event: Parameters<SidecarLogger>[0]): void {
  console.log(JSON.stringify(redactJsonForLog(event)));
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function checkAuth(
  request: IncomingMessage,
  authSecret: string | undefined,
): boolean {
  if (authSecret === undefined || authSecret.length === 0) {
    return true;
  }
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return false;
  }
  const expected = `Bearer ${authSecret}`;
  return header.length === expected.length && header === expected;
}

async function readLimitedBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("body_too_large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function cliFailureMessage(classification: string): string {
  switch (classification) {
    case "timeout":
      return "CLI execution timed out.";
    case "cancelled":
      return "CLI execution was cancelled.";
    case "spawn_error":
      return "Failed to launch CLI process.";
    case "invalid_output":
      return "CLI produced invalid structured output.";
    default:
      return "CLI execution failed.";
  }
}

export function createCliSidecar(options: CliSidecarOptions): CliSidecar {
  const log = options.logger ?? defaultLogger;
  let draining = options.config.draining;
  const registry = new ExecutionRegistry(
    options.config.maxConcurrentExecutions,
    options.config.completedCacheMaxEntries,
    options.config.completedCacheTtlMs,
  );

  /** Primary HTTP request abort signals keyed by executionId (not shared on coalesce). */
  const executionAbortControllers = new Map<string, AbortController>();

  function claimExecutionAbort(
    executionId: string,
  ): AbortController | undefined {
    if (registry.getCached(executionId) !== undefined) {
      return undefined;
    }
    if (executionAbortControllers.has(executionId)) {
      return undefined;
    }
    const controller = new AbortController();
    executionAbortControllers.set(executionId, controller);
    return controller;
  }

  const runtimeHandler = createRuntimeHandler(
    createRuntime({
      execute: async (input, context) => {
        if (draining) {
          throw new RuntimeExecutionError(
            "Sidecar is shutting down.",
            RUNTIME_PROTOCOL_ERROR_CODES.AGENT_EXECUTION_FAILED,
          );
        }

        log({
          type: "execution_received",
          executionId: context.executionId,
        });

        assertSupportedRunInput(input);

        const cwdHint = readWorkingDirectoryHint(input);
        const workingDirectory = assertPathUnderRoot(
          options.config.workspaceRoot,
          cwdHint ?? ".",
        );
        const deadlineMs = readDeadlineMs(
          input,
          options.config.defaultDeadlineMs,
        );

        let response: RuntimeExecuteResponse;
        try {
          response = await registry.coalesce(
            context.executionId,
            fingerprintRunInput(input),
            async (): Promise<RuntimeExecuteResponse> => {
              const abortController =
                executionAbortControllers.get(context.executionId) ??
                new AbortController();
              const cliResult = await runCliExecution(
                options.provider,
                options.config,
                {
                  executionId: context.executionId,
                  runInput: input,
                  workingDirectory,
                  deadlineMs,
                  signal: abortController.signal,
                },
                log,
              );

              if (
                cliResult.outcome === "success" &&
                cliResult.output !== undefined
              ) {
                return {
                  protocolVersion: RUNTIME_PROTOCOL_VERSION,
                  executionId: context.executionId,
                  outcome: "SUCCEEDED",
                  output: cliResult.output,
                };
              }

              return {
                protocolVersion: RUNTIME_PROTOCOL_VERSION,
                executionId: context.executionId,
                outcome: "FAILED",
                error: {
                  code: RUNTIME_PROTOCOL_ERROR_CODES.AGENT_EXECUTION_FAILED,
                  message: cliFailureMessage(cliResult.classification),
                },
              };
            },
            () => {
              log({
                type: "execution_duplicate_coalesced",
                executionId: context.executionId,
              });
            },
          );
        } catch (error) {
          if (error instanceof ExecutionIdentityConflictError) {
            throw new RuntimeExecutionError(
              error.message,
              RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
            );
          }
          throw error;
        }

        if (response.outcome === "SUCCEEDED") {
          return response.output as JsonValue;
        }

        throw new RuntimeExecutionError(
          response.error.message,
          response.error.code,
        );
      },
    }),
    {
      ...(options.config.capabilityTimeoutMs !== undefined
        ? { capabilityTimeoutMs: options.config.capabilityTimeoutMs }
        : {}),
    },
  );

  const executePath = options.config.executePath;

  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/health/live" && request.method === "GET") {
      sendJson(response, 200, { status: "live" });
      return;
    }

    if (url.pathname === "/health/ready" && request.method === "GET") {
      if (draining) {
        sendJson(response, 503, { status: "draining" });
        return;
      }
      sendJson(response, 200, { status: "ready" });
      return;
    }

    if (url.pathname === executePath && request.method === "POST") {
      if (!checkAuth(request, options.config.authSecret)) {
        sendJson(response, 401, {
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          outcome: "FAILED",
          error: {
            code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
            message: "Unauthorized.",
          },
        });
        return;
      }

      if (draining) {
        sendJson(response, 503, {
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          outcome: "FAILED",
          error: {
            code: RUNTIME_PROTOCOL_ERROR_CODES.AGENT_EXECUTION_FAILED,
            message: "Sidecar is shutting down.",
          },
        });
        return;
      }

      let raw: Buffer;
      try {
        raw = await readLimitedBody(request, RUNTIME_PROTOCOL_MAX_BODY_BYTES);
      } catch {
        sendJson(response, 413, {
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          outcome: "FAILED",
          error: {
            code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
            message: "Request body exceeds maximum size.",
          },
        });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        sendJson(response, 400, {
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          outcome: "FAILED",
          error: {
            code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
            message: "Request body must be valid JSON.",
          },
        });
        return;
      }

      const executionId =
        typeof body === "object" &&
        body !== null &&
        "executionId" in body &&
        typeof (body as { executionId: unknown }).executionId === "string"
          ? (body as { executionId: string }).executionId
          : undefined;

      let abortController: AbortController | undefined;
      if (executionId !== undefined) {
        abortController = claimExecutionAbort(executionId);
        if (abortController !== undefined) {
          request.on("aborted", () => abortController?.abort());
          request.on("close", () => {
            if (!response.writableEnded) {
              abortController?.abort();
            }
          });
        }
      }

      try {
        const result = await runtimeHandler.handleExecuteRequest(body);
        sendJson(response, 200, result);
      } catch (error) {
        if (error instanceof RuntimeProtocolError) {
          sendJson(response, 400, {
            protocolVersion: RUNTIME_PROTOCOL_VERSION,
            outcome: "FAILED",
            error: {
              code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
              message: error.message,
            },
          });
          return;
        }
        sendJson(response, 500, {
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          outcome: "FAILED",
          error: {
            code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
            message: "Internal runtime handler failure.",
          },
        });
      } finally {
        if (executionId !== undefined && abortController !== undefined) {
          executionAbortControllers.delete(executionId);
        }
      }
      return;
    }

    sendJson(response, 404, {
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      outcome: "FAILED",
      error: {
        code: RUNTIME_PROTOCOL_ERROR_CODES.PROTOCOL_FAILURE,
        message: "Not found.",
      },
    });
  }

  return {
    server,
    registry,
    config: options.config,
    beginDraining() {
      draining = true;
      log({ type: "sidecar_shutting_down" });
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.config.port, options.config.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    close() {
      draining = true;
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
