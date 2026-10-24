import { describe, expect, it } from "vitest";
import { createGeminiCliProvider } from "../src/providers/gemini-provider.js";
import { runCliExecution } from "../src/runner.js";
import type { SidecarConfig } from "../src/types.js";
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

describe("gemini-cli provider", () => {
  it("parses successful JSON responses", () => {
    const provider = createGeminiCliProvider({
      workspaceRoot: os.tmpdir(),
    });
    const result = provider.parseOutput(
      JSON.stringify({ response: "hello", stats: { inputTokens: 1 } }),
      "",
      0,
      {},
    );
    expect(result).toMatchObject({
      outcome: "success",
      output: { provider: "gemini-cli", response: "hello" },
    });
  });

  it("handles API error JSON", () => {
    const provider = createGeminiCliProvider({ workspaceRoot: os.tmpdir() });
    const result = provider.parseOutput(
      JSON.stringify({ error: { message: "quota" } }),
      "",
      0,
      {},
    );
    expect(result.outcome).toBe("failure");
  });

  it("rejects malformed JSON and missing response", () => {
    const provider = createGeminiCliProvider({ workspaceRoot: os.tmpdir() });
    expect(provider.parseOutput("not-json", "", 0, {}).classification).toBe(
      "invalid_output",
    );
    expect(
      provider.parseOutput(JSON.stringify({ stats: {} }), "", 0, {})
        .classification,
    ).toBe("invalid_output");
  });

  it("runs subprocess fixtures for success and failure paths", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(os.tmpdir(), "osva-gemini-unit-"),
    );
    await mkdir(workspaceRoot, { recursive: true });
    const base = createGeminiCliProvider({
      workspaceRoot,
      command: process.execPath,
      sandbox: false,
      skipTrust: true,
    });
    const provider = wrapFixtureArgvProvider(base, VENDOR_FIXTURES.gemini);
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
      cliProvider: "gemini",
    };
    const log = () => {};
    const ok = await runCliExecution(
      provider,
      config,
      {
        executionId: "g1",
        runInput: { prompt: scenarioPrompt("success") },
        workingDirectory: workspaceRoot,
        deadlineMs: 10_000,
        signal: new AbortController().signal,
      },
      log,
    );
    expect(ok).toMatchObject({ outcome: "success" });

    const fail = await runCliExecution(
      provider,
      config,
      {
        executionId: "g2",
        runInput: { prompt: scenarioPrompt("fail-exit") },
        workingDirectory: workspaceRoot,
        deadlineMs: 10_000,
        signal: new AbortController().signal,
      },
      log,
    );
    expect(fail.outcome).toBe("failure");
  });

  it("integrates over HTTP with fixture binary", async () => {
    const { sidecar, baseUrl } = await startVendorSidecar("gemini");
    try {
      const { json } = await postExecute(
        baseUrl,
        buildVendorExecuteBody({
          executionId: "gemini-http-1",
          scenario: "success",
        }),
      );
      expect(json).toMatchObject({
        outcome: "SUCCEEDED",
        output: { provider: "gemini-cli", response: "gemini-fixture-ok" },
      });
    } finally {
      await sidecar.close();
    }
  });
});
