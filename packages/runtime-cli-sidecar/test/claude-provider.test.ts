import { describe, expect, it } from "vitest";
import { createClaudeCliProvider } from "../src/providers/claude-provider.js";
import {
  buildVendorExecuteBody,
  scenarioPrompt,
  startVendorSidecar,
  VENDOR_FIXTURES,
  wrapFixtureArgvProvider,
} from "./vendor-helpers.js";
import { postExecute } from "./helpers.js";
import path from "node:path";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import { runCliExecution } from "../src/runner.js";
import type { SidecarConfig } from "../src/types.js";

describe("claude-code-cli provider", () => {
  it("parses JSON success and structured output", () => {
    const provider = createClaudeCliProvider({ workspaceRoot: os.tmpdir() });
    const text = provider.parseOutput(
      JSON.stringify({ result: "done", session_id: "s1" }),
      "",
      0,
      {},
    );
    expect(text.outcome).toBe("success");

    const structured = provider.parseOutput(
      JSON.stringify({
        result: "",
        structured_output: { ok: true },
      }),
      "",
      0,
      {},
    );
    expect(structured.outcome).toBe("success");
  });

  it("maps provider and permission errors to failures", () => {
    const provider = createClaudeCliProvider({ workspaceRoot: os.tmpdir() });
    expect(
      provider.parseOutput(
        JSON.stringify({ is_error: true, error: "authentication_failed" }),
        "",
        1,
        {},
      ).outcome,
    ).toBe("failure");
  });

  it("runs subprocess fixtures", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(os.tmpdir(), "osva-claude-unit-"),
    );
    await mkdir(workspaceRoot, { recursive: true });
    const base = createClaudeCliProvider({
      workspaceRoot,
      command: process.execPath,
      bare: true,
      allowedTools: "Read",
    });
    const provider = wrapFixtureArgvProvider(base, VENDOR_FIXTURES.claude);
    const config: SidecarConfig = {
      host: "127.0.0.1",
      port: 0,
      executePath: "/execute",
      maxConcurrentExecutions: 2,
      defaultDeadlineMs: 10_000,
      maxStdoutBytes: 2_097_152,
      maxStderrBytes: 262_144,
      workspaceRoot,
      envAllowlist: ["PATH", "PATHEXT"],
      completedCacheMaxEntries: 8,
      completedCacheTtlMs: 60_000,
      draining: false,
      cliProvider: "claude",
    };
    const log = () => {};
    const ok = await runCliExecution(
      provider,
      config,
      {
        executionId: "cl1",
        runInput: { prompt: scenarioPrompt("success") },
        workingDirectory: workspaceRoot,
        deadlineMs: 10_000,
        signal: new AbortController().signal,
      },
      log,
    );
    expect(ok).toMatchObject({
      outcome: "success",
      output: { response: "claude-fixture-ok" },
    });
  });

  it("integrates over HTTP", async () => {
    const { sidecar, baseUrl } = await startVendorSidecar("claude");
    try {
      const { json } = await postExecute(
        baseUrl,
        buildVendorExecuteBody({
          executionId: "claude-http-1",
          scenario: "success",
        }),
      );
      expect(json).toMatchObject({
        outcome: "SUCCEEDED",
        output: { provider: "claude-code-cli", response: "claude-fixture-ok" },
      });
    } finally {
      await sidecar.close();
    }
  });
});
