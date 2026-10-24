import { describe, expect, it } from "vitest";
import { createCodexCliProvider } from "../src/providers/codex-provider.js";
import { parseJsonl } from "../src/providers/shared/jsonl.js";
import { assertCodexSandboxMode } from "../src/providers/shared/sandbox-policy.js";
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

describe("codex-cli provider", () => {
  it("parses JSONL streams with final agent message", () => {
    const stdout = [
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"answer"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1}}',
    ].join("\n");
    const provider = createCodexCliProvider({ workspaceRoot: os.tmpdir() });
    const result = provider.parseOutput(stdout, "", 0, {});
    expect(result).toMatchObject({
      outcome: "success",
      output: { provider: "codex-cli", response: "answer" },
    });
  });

  it("handles partial JSONL chunks in parser", () => {
    const { events, partialLine } = parseJsonl(
      '{"type":"turn.started"}\n{"type":',
    );
    expect(events.length).toBe(1);
    expect(partialLine).toBeDefined();
  });

  it("rejects unsafe sandbox configuration", () => {
    expect(() => assertCodexSandboxMode("danger-full-access")).toThrow();
  });

  it("runs subprocess fixtures including multi-event streams", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(os.tmpdir(), "osva-codex-unit-"),
    );
    await mkdir(workspaceRoot, { recursive: true });
    const base = createCodexCliProvider({
      workspaceRoot,
      command: process.execPath,
      sandbox: "read-only",
      skipGitRepoCheck: true,
    });
    const provider = wrapFixtureArgvProvider(base, VENDOR_FIXTURES.codex);
    const config: SidecarConfig = {
      host: "127.0.0.1",
      port: 0,
      executePath: "/execute",
      maxConcurrentExecutions: 2,
      defaultDeadlineMs: 15_000,
      maxStdoutBytes: 4_194_304,
      maxStderrBytes: 262_144,
      workspaceRoot,
      envAllowlist: ["PATH", "PATHEXT"],
      completedCacheMaxEntries: 8,
      completedCacheTtlMs: 60_000,
      draining: false,
      cliProvider: "codex",
    };
    const log = () => {};
    const multi = await runCliExecution(
      provider,
      config,
      {
        executionId: "c1",
        runInput: { prompt: scenarioPrompt("multi-event") },
        workingDirectory: workspaceRoot,
        deadlineMs: 15_000,
        signal: new AbortController().signal,
      },
      log,
    );
    expect(multi.output).toMatchObject({ response: "final-answer" });

    const missing = await runCliExecution(
      provider,
      config,
      {
        executionId: "c2",
        runInput: { prompt: scenarioPrompt("missing-terminal") },
        workingDirectory: workspaceRoot,
        deadlineMs: 15_000,
        signal: new AbortController().signal,
      },
      log,
    );
    expect(missing.outcome).toBe("failure");
  });

  it("integrates over HTTP", async () => {
    const { sidecar, baseUrl } = await startVendorSidecar("codex");
    try {
      const { json } = await postExecute(
        baseUrl,
        buildVendorExecuteBody({
          executionId: "codex-http-1",
          scenario: "success",
        }),
      );
      expect(json).toMatchObject({
        outcome: "SUCCEEDED",
        output: { provider: "codex-cli", response: "codex-fixture-ok" },
      });
    } finally {
      await sidecar.close();
    }
  });
});
