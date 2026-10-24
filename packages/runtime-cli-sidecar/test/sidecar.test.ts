import { describe, expect, it } from "vitest";
import { RUNTIME_PROTOCOL_MAX_BODY_BYTES } from "@osva-ai/runtime-protocol";
import { redactSensitiveText } from "../src/redact.js";
import { buildExecuteBody, postExecute, startTestSidecar } from "./helpers.js";

describe("runtime-cli-sidecar", () => {
  it("validates protocol requests and returns success", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const body = buildExecuteBody({ executionId: "exec-success-1" });
      const { status, json } = await postExecute(baseUrl, body);
      expect(status).toBe(200);
      expect(json).toMatchObject({
        outcome: "SUCCEEDED",
        executionId: "exec-success-1",
        output: { ok: true, scenario: "success" },
      });
    } finally {
      await sidecar.close();
    }
  });

  it("returns FAILED for CLI failure scenarios", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const { json } = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-fail-1",
          input: { scenario: "fail" },
        }),
      );
      expect(json).toMatchObject({
        outcome: "FAILED",
        error: { code: "AGENT_EXECUTION_FAILED" },
      });
    } finally {
      await sidecar.close();
    }
  });

  it("classifies invalid CLI JSON as execution failure", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const { json } = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-invalid-json",
          input: { scenario: "invalid-json" },
        }),
      );
      expect(json).toMatchObject({
        outcome: "FAILED",
        error: { message: "CLI produced invalid structured output." },
      });
    } finally {
      await sidecar.close();
    }
  });

  it("rejects duplicate executionId with conflicting input", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const first = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-conflict-1",
          input: { scenario: "success" },
        }),
      );
      expect(first.json).toMatchObject({ outcome: "SUCCEEDED" });

      const second = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-conflict-1",
          input: { scenario: "fail" },
        }),
      );
      expect(second.status).toBe(200);
      expect(second.json).toMatchObject({
        outcome: "FAILED",
        error: {
          code: "RUNTIME_PROTOCOL_FAILURE",
          message: expect.stringContaining("different run input"),
        },
      });
    } finally {
      await sidecar.close();
    }
  });

  it("coalesces duplicate executionId requests", async () => {
    const logs: import("../src/types.js").SidecarLogEvent[] = [];
    const { sidecar, baseUrl } = await startTestSidecar(
      { defaultDeadlineMs: 30_000 },
      logs,
    );
    try {
      const body = buildExecuteBody({
        executionId: "exec-dup-1",
        input: { scenario: "slow" },
      });
      const [first, second] = await Promise.all([
        postExecute(baseUrl, body),
        postExecute(baseUrl, body),
      ]);
      expect(first.json).toMatchObject({ outcome: "SUCCEEDED" });
      expect(second.json).toEqual(first.json);
      expect(
        logs.some((entry) => entry.type === "execution_duplicate_coalesced"),
      ).toBe(true);
    } finally {
      await sidecar.close();
    }
  });

  it("enforces concurrency limits", async () => {
    const { sidecar, baseUrl, registry } = await startTestSidecar({
      maxConcurrentExecutions: 1,
    });
    try {
      const slow = postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-slow-a",
          input: { scenario: "slow" },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(registry.getActiveCount()).toBeLessThanOrEqual(1);
      const second = postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-slow-b",
          input: { scenario: "slow" },
        }),
      );
      const [a, b] = await Promise.all([slow, second]);
      expect(a.json).toMatchObject({ outcome: "SUCCEEDED" });
      expect(b.json).toMatchObject({ outcome: "SUCCEEDED" });
    } finally {
      await sidecar.close();
    }
  });

  it("rejects oversized request bodies", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const huge = "x".repeat(RUNTIME_PROTOCOL_MAX_BODY_BYTES + 32);
      const response = await fetch(`${baseUrl}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...buildExecuteBody({ executionId: "exec-big-body" }),
          padding: huge,
        }),
      });
      expect(response.status).toBe(413);
    } finally {
      await sidecar.close();
    }
  });

  it("enforces execution deadlines and terminates hung CLI", async () => {
    const { sidecar, baseUrl } = await startTestSidecar({
      defaultDeadlineMs: 800,
    });
    try {
      const { json } = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-hang",
          input: { scenario: "hang", deadlineMs: 800 },
        }),
      );
      expect(json).toMatchObject({
        outcome: "FAILED",
        error: { message: "CLI execution timed out." },
      });
    } finally {
      await sidecar.close();
    }
  }, 20_000);

  it("rejects path traversal working directories", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const { json } = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-path-traversal",
          input: { scenario: "success", cwd: "../../../Windows" },
        }),
      );
      expect(json).toMatchObject({
        outcome: "FAILED",
      });
    } finally {
      await sidecar.close();
    }
  });

  it("requires auth when configured", async () => {
    const { sidecar, baseUrl } = await startTestSidecar({
      authSecret: "test-secret",
    });
    try {
      const unauthorized = await postExecute(
        baseUrl,
        buildExecuteBody({ executionId: "exec-auth" }),
      );
      expect(unauthorized.status).toBe(401);

      const authorized = await postExecute(
        baseUrl,
        buildExecuteBody({ executionId: "exec-auth-2" }),
        { headers: { authorization: "Bearer test-secret" } },
      );
      expect(authorized.status).toBe(200);
    } finally {
      await sidecar.close();
    }
  });

  it("redacts capability tokens from log-oriented strings", () => {
    const sample =
      'request {"capabilities":{"token":"abc123","endpoint":"http://x"}} Bearer abc123';
    const redacted = redactSensitiveText(sample);
    expect(redacted).not.toContain("abc123");
    expect(redacted).toContain("[REDACTED]");
  });

  it("exposes health endpoints and draining on shutdown", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    const live = await fetch(`${baseUrl}/health/live`);
    expect(live.status).toBe(200);
    const ready = await fetch(`${baseUrl}/health/ready`);
    expect(ready.status).toBe(200);
    sidecar.beginDraining();
    const draining = await fetch(`${baseUrl}/health/ready`);
    expect(draining.status).toBe(503);
    await sidecar.close();
  });

  it("rejects unsupported interactive approval input", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const { json } = await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "exec-approval",
          input: { interactiveApproval: true },
        }),
      );
      expect(json).toMatchObject({
        outcome: "FAILED",
        error: { message: expect.stringContaining("Interactive approval") },
      });
    } finally {
      await sidecar.close();
    }
  });
});
