import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("external pack consumer", () => {
  it("packs and typechecks outside the workspace", () => {
    const script = path.join(
      repoRoot,
      "scripts",
      "acceptance",
      "a1-1-pack-consumer.mjs",
    );
    const result = spawnSync(process.execPath, [script], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
    expect(result.status).toBe(0);
  });
});
