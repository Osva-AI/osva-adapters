import { describe, expect, it } from "vitest";
import { RUNTIME_PROTOCOL_MAX_BODY_BYTES } from "@osva-ai/runtime-protocol";
import { buildExecuteBody, postExecute, startTestSidecar } from "./helpers.js";

const CAPABILITY_PROBE = "security-test-capability-token-value";

describe("runtime-cli-sidecar security negatives", () => {
  it("rejects invalid Bearer auth when configured", async () => {
    const { sidecar, baseUrl } = await startTestSidecar({
      authSecret: "expected-secret",
    });
    try {
      const bad = await postExecute(
        baseUrl,
        buildExecuteBody({ executionId: "sec-auth-bad" }),
      );
      expect(bad.status).toBe(401);
      const good = await postExecute(
        baseUrl,
        buildExecuteBody({ executionId: "sec-auth-good" }),
        { headers: { authorization: "Bearer expected-secret" } },
      );
      expect(good.status).toBe(200);
    } finally {
      await sidecar.close();
    }
  });

  it("rejects invalid protocol version", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const body = {
        ...buildExecuteBody({ executionId: "sec-bad-version" }),
        protocolVersion: "0",
      };
      const response = await fetch(`${baseUrl}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).not.toBe(200);
    } finally {
      await sidecar.close();
    }
  });

  it("rejects execute while draining", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    sidecar.beginDraining();
    try {
      const ready = await fetch(`${baseUrl}/health/ready`);
      expect(ready.status).toBe(503);
      const { status } = await postExecute(
        baseUrl,
        buildExecuteBody({ executionId: "sec-draining" }),
      );
      expect(status).toBe(503);
    } finally {
      await sidecar.close();
    }
  });

  it("does not echo capability tokens in failure paths", async () => {
    const logs: import("../src/types.js").SidecarLogEvent[] = [];
    const { sidecar, baseUrl } = await startTestSidecar({}, logs);
    try {
      await postExecute(
        baseUrl,
        buildExecuteBody({
          executionId: "sec-token-echo",
          token: CAPABILITY_PROBE,
          input: { scenario: "fail" },
        }),
      );
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(CAPABILITY_PROBE);
    } finally {
      await sidecar.close();
    }
  });

  it("rejects oversized bodies", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const huge = "z".repeat(RUNTIME_PROTOCOL_MAX_BODY_BYTES + 64);
      const response = await fetch(`${baseUrl}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...buildExecuteBody({ executionId: "sec-oversized" }),
          pad: huge,
        }),
      });
      expect(response.status).toBe(413);
    } finally {
      await sidecar.close();
    }
  });

  it("rejects interactive approval fields in run input", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      for (const input of [
        { interactiveApproval: true },
        { humanApproval: true },
      ]) {
        const { json } = await postExecute(
          baseUrl,
          buildExecuteBody({
            executionId: `sec-input-${Object.keys(input)[0]}`,
            input,
          }),
        );
        expect(json).toMatchObject({ outcome: "FAILED" });
      }
    } finally {
      await sidecar.close();
    }
  });
});
