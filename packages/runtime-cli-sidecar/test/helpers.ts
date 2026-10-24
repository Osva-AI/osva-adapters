import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFixtureCliProvider } from "../src/providers/fixture-provider.js";
import { createCliSidecar } from "../src/sidecar.js";
import type { SidecarConfig, SidecarLogEvent } from "../src/types.js";

export const PROTOCOL_VERSION = "1" as const;

export function createTestConfig(
  workspaceRoot: string,
  overrides: Partial<SidecarConfig> = {},
): SidecarConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    executePath: "/execute",
    maxConcurrentExecutions: 4,
    defaultDeadlineMs: 30_000,
    maxStdoutBytes: 1_048_576,
    maxStderrBytes: 262_144,
    workspaceRoot,
    envAllowlist: ["PATH", "PATHEXT", "SystemRoot", "HOME", "USERPROFILE"],
    completedCacheMaxEntries: 128,
    completedCacheTtlMs: 60_000,
    draining: false,
    cliProvider: "fixture",
    ...overrides,
  };
}

export async function startTestSidecar(
  overrides: Partial<SidecarConfig> = {},
  logSink: SidecarLogEvent[] = [],
) {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "osva-sidecar-test-"),
  );
  await mkdir(workspaceRoot, { recursive: true });
  const config = createTestConfig(workspaceRoot, overrides);
  const provider = createFixtureCliProvider({ workspaceRoot });
  const sidecar = createCliSidecar({
    provider,
    config,
    logger: (event) => logSink.push(event),
  });
  await sidecar.listen();
  const address = sidecar.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected sidecar to listen on a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  return {
    sidecar,
    baseUrl,
    workspaceRoot,
    logSink,
    config,
    registry: sidecar.registry,
  };
}

export function buildExecuteBody(options: {
  executionId: string;
  input?: unknown;
  token?: string;
}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    executionId: options.executionId,
    input: options.input ?? { scenario: "success" },
    capabilities: {
      endpoint: "http://127.0.0.1:1",
      token: options.token ?? "capability-token-secret-value",
    },
  };
}

export async function postExecute(
  baseUrl: string,
  body: unknown,
  init: RequestInit = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
  const json = (await response.json()) as unknown;
  return { status: response.status, json };
}
