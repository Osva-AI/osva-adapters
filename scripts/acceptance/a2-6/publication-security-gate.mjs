#!/usr/bin/env node
/**
 * Hard gate for manual npm publish of @osva-ai/runtime-cli-sidecar.
 * Exits non-zero when known publication blockers are present.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const KNOWN_VULNERABLE_ZOD = new Set(["4.6.5"]);

async function main() {
  const lockText = await readFile(
    path.join(REPO_ROOT, "pnpm-lock.yaml"),
    "utf8",
  );
  const zodVersions = [...lockText.matchAll(/zod@(\d+\.\d+\.\d+)/g)].map(
    (m) => m[1],
  );
  const vulnerable = zodVersions.filter((v) => KNOWN_VULNERABLE_ZOD.has(v));
  if (vulnerable.length > 0) {
    console.error(
      `Publication blocked: zod@${vulnerable.join(",")} (GHSA-mrhx-c7xc-m3w5). ` +
        "Requires upstream @osva-ai/* RC release with zod>=4.6.6.",
    );
    process.exit(1);
  }
  console.log("Publication security gate: zod advisory check passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
