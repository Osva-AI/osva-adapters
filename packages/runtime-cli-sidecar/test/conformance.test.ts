import { describe, expect, it } from "vitest";
import { buildExecuteBody, postExecute } from "./helpers.js";
import { startTestSidecar } from "./helpers.js";
import {
  buildVendorExecuteBody,
  scenarioPrompt,
  startVendorSidecar,
  type VendorFixtureKind,
} from "./vendor-helpers.js";

const VENDORS: VendorFixtureKind[] = ["gemini", "codex", "claude"];

describe("cross-provider conformance (fixture CLIs)", () => {
  for (const vendor of VENDORS) {
    describe(vendor, () => {
      it("returns protocol success for valid prompt input", async () => {
        const { sidecar, baseUrl } = await startVendorSidecar(vendor);
        try {
          const { status, json } = await postExecute(
            baseUrl,
            buildVendorExecuteBody({
              executionId: `${vendor}-conf-success`,
              scenario: "success",
            }),
          );
          expect(status).toBe(200);
          expect(json).toMatchObject({ outcome: "SUCCEEDED" });
        } finally {
          await sidecar.close();
        }
      });

      it("returns protocol failure for CLI error scenarios", async () => {
        const { sidecar, baseUrl } = await startVendorSidecar(vendor);
        try {
          const scenario =
            vendor === "gemini"
              ? "api-error"
              : vendor === "codex"
                ? "error-event"
                : "provider-error";
          const { json } = await postExecute(
            baseUrl,
            buildVendorExecuteBody({
              executionId: `${vendor}-conf-fail`,
              scenario,
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

      it("rejects duplicate executionId with conflicting input", async () => {
        const { sidecar, baseUrl } = await startVendorSidecar(vendor);
        try {
          const id = `${vendor}-conf-dup`;
          const first = await postExecute(
            baseUrl,
            buildVendorExecuteBody({ executionId: id, scenario: "success" }),
          );
          expect(first.json).toMatchObject({ outcome: "SUCCEEDED" });
          const second = await postExecute(
            baseUrl,
            buildVendorExecuteBody({
              executionId: id,
              prompt: scenarioPrompt("fail-exit"),
            }),
          );
          expect(second.json).toMatchObject({
            outcome: "FAILED",
            error: { code: "RUNTIME_PROTOCOL_FAILURE" },
          });
        } finally {
          await sidecar.close();
        }
      });

      it("enforces execution deadlines", async () => {
        const { sidecar, baseUrl } = await startVendorSidecar(vendor, {
          defaultDeadlineMs: 800,
        });
        try {
          const { json } = await postExecute(
            baseUrl,
            buildVendorExecuteBody({
              executionId: `${vendor}-conf-timeout`,
              scenario: "hang",
              extraInput: { deadlineMs: 800 },
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
        const { sidecar, baseUrl } = await startVendorSidecar(vendor);
        try {
          const { json } = await postExecute(
            baseUrl,
            buildVendorExecuteBody({
              executionId: `${vendor}-conf-path`,
              scenario: "success",
              extraInput: { cwd: "../../../Windows" },
            }),
          );
          expect(json).toMatchObject({ outcome: "FAILED" });
        } finally {
          await sidecar.close();
        }
      });

      it("rejects interactive approval fields", async () => {
        const { sidecar, baseUrl } = await startVendorSidecar(vendor);
        try {
          const { json } = await postExecute(
            baseUrl,
            buildVendorExecuteBody({
              executionId: `${vendor}-conf-approval`,
              scenario: "success",
              extraInput: { interactiveApproval: true },
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
  }

  it("preserves A2.1 fixture provider behavior", async () => {
    const { sidecar, baseUrl } = await startTestSidecar();
    try {
      const { json } = await postExecute(
        baseUrl,
        buildExecuteBody({ executionId: "fixture-regression" }),
      );
      expect(json).toMatchObject({
        outcome: "SUCCEEDED",
        output: { ok: true, scenario: "success" },
      });
    } finally {
      await sidecar.close();
    }
  });
});
