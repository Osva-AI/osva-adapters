#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolvePackageManagerCommand } from "./spawn-package-manager.mjs";

assert.equal(
  resolvePackageManagerCommand("npm"),
  process.platform === "win32" ? "npm.cmd" : "npm",
);

const helperSource = readFileSync(
  fileURLToPath(new URL("./spawn-package-manager.mjs", import.meta.url)),
  "utf8",
);
assert.match(helperSource, /shell:\s*false/);
assert.doesNotMatch(helperSource, /shell:\s*true,/);

console.log("spawn-package-manager.test.mjs passed");
