import { describe, expect, it } from "vitest";
import {
  buildVendorExecuteBody,
  startVendorSidecar,
} from "./vendor-helpers.js";

describe("Runtime Protocol V1 SDK handler interop", () => {
  it("accepts SDK-shaped execute bodies over HTTP", async () => {
    const { sidecar, baseUrl } = await startVendorSidecar("gemini");
    try {
      const body = buildVendorExecuteBody({
        executionId: "sdk-interop-1",
        scenario: "success",
      });

      const response = await fetch(`${baseUrl}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as {
        outcome: string;
        executionId: string;
      };
      expect(json).toMatchObject({
        outcome: "SUCCEEDED",
        executionId: "sdk-interop-1",
      });
    } finally {
      await sidecar.close();
    }
  });
});
