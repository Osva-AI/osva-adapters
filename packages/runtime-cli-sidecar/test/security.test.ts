import os from "node:os";
import { describe, expect, it } from "vitest";
import { createClaudeCliProvider } from "../src/providers/claude-provider.js";
import { createCodexCliProvider } from "../src/providers/codex-provider.js";
import { createGeminiCliProvider } from "../src/providers/gemini-provider.js";
import { extractPrompt } from "../src/providers/shared/run-input.js";
import { redactSensitiveText } from "../src/redact.js";
import { postExecute } from "./helpers.js";
import {
  buildVendorExecuteBody,
  startVendorSidecar,
} from "./vendor-helpers.js";

describe("cli sidecar security negatives", () => {
  it("rejects run input that attempts to override provider policy", () => {
    expect(() =>
      extractPrompt({
        prompt: "hello",
        provider: "malicious",
        command: "/bin/sh",
      }),
    ).toThrow(/cannot override/);
  });

  it("rejects forbidden gemini approval modes at launch", () => {
    const provider = createGeminiCliProvider({ workspaceRoot: "/tmp" });
    expect(() =>
      provider.buildLaunch({
        executionId: "x",
        runInput: { prompt: "hi", geminiApprovalMode: "yolo" },
        workingDirectory: "/tmp",
        deadlineMs: 1000,
        signal: new AbortController().signal,
      }),
    ).toThrow(/not permitted/);
  });

  it("rejects empty Claude allowedTools allowlist", () => {
    expect(() =>
      createClaudeCliProvider({
        workspaceRoot: os.tmpdir(),
        allowedTools: "   ",
      }),
    ).toThrow(/non-empty/);
  });

  it("rejects dangerous codex sandbox in provider config", () => {
    expect(() =>
      createCodexCliProvider({
        workspaceRoot: "/tmp",
        sandbox: "danger-full-access",
      }),
    ).toThrow(/not permitted/);
  });

  it("does not reflect capability tokens in redacted logs", () => {
    const sample = 'Bearer sk-test-token capabilities {"token":"abc123"}';
    const redacted = redactSensitiveText(sample);
    expect(redacted).not.toContain("sk-test-token");
    expect(redacted).not.toContain("abc123");
  });

  it("rejects missing prompt for vendor providers over HTTP", async () => {
    const { sidecar, baseUrl } = await startVendorSidecar("gemini");
    try {
      const { json } = await postExecute(baseUrl, {
        protocolVersion: "1",
        executionId: "sec-no-prompt",
        input: { scenario: "success" },
        capabilities: { endpoint: "http://127.0.0.1:1", token: "secret-cap" },
      });
      expect(json).toMatchObject({
        outcome: "FAILED",
        error: { code: "AGENT_EXECUTION_FAILED" },
      });
    } finally {
      await sidecar.close();
    }
  });

  it("requires auth when configured for vendor sidecars", async () => {
    const { sidecar, baseUrl } = await startVendorSidecar("codex", {
      authSecret: "vendor-secret",
    });
    try {
      const unauthorized = await postExecute(
        baseUrl,
        buildVendorExecuteBody({
          executionId: "sec-auth",
          scenario: "success",
        }),
      );
      expect(unauthorized.status).toBe(401);
      const authorized = await postExecute(
        baseUrl,
        buildVendorExecuteBody({
          executionId: "sec-auth-2",
          scenario: "success",
        }),
        { headers: { authorization: "Bearer vendor-secret" } },
      );
      expect(authorized.status).toBe(200);
    } finally {
      await sidecar.close();
    }
  });
});
