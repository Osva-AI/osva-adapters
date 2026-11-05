#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_DIST_TAGS,
  PACKAGE_DIRS,
  validatePublishInputs,
} from "./validate-publish-inputs.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const workflowPath = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "publish-package.yml",
);
const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");

assert.match(workflow, /^\s+preflight:/m, "preflight job required");
assert.match(workflow, /^\s+publish:/m, "publish job required");
assert.match(
  workflow,
  /confirm_real_publish[\s\S]*PUBLISH/,
  "confirm_real_publish documented",
);
assert.match(
  workflow,
  /if:\s*needs\.plan\.outputs\.real_publish == 'true'/,
  "publish gated on real_publish output",
);
const preflightJob =
  workflow.match(/^\s{2}preflight:\n[\s\S]*?(?=^\s{2}\w)/m)?.[0] ?? "";
assert.ok(preflightJob.length > 0, "preflight job block required");
assert.doesNotMatch(
  preflightJob,
  /^\s+environment:\s*npm-publish/m,
  "preflight must not use npm-publish environment",
);

const publishJob =
  workflow.match(/^\s{2}publish:\n[\s\S]*?(?=^\s{2}\w|\Z)/m)?.[0] ?? "";
assert.match(
  publishJob,
  /^\s+environment:\s*npm-publish/m,
  "publish job must use npm-publish environment",
);
assert.match(
  workflow,
  /npm publish --dry-run/,
  "preflight must use npm publish dry-run",
);
assert.match(
  workflow,
  /validate-publish-inputs\.mjs/,
  "workflow must validate inputs via node script",
);

assert.doesNotMatch(
  preflightJob,
  /NPM_TOKEN|NODE_AUTH_TOKEN|registry-url/,
  "preflight must not configure npm credentials",
);

const valid = validatePublishInputs({
  packageName: "@osva-ai/adapter-artifact-memory",
  expectedVersion: "0.1.2",
  distTag: "rc",
  confirmLatest: "",
  confirmPublish: "",
});
assert.equal(valid.ok, true);
assert.equal(valid.preflightOnly, true);

const latestBlocked = validatePublishInputs({
  packageName: "@osva-ai/adapter-artifact-azure",
  expectedVersion: "0.1.2",
  distTag: "latest",
  confirmLatest: "",
  confirmPublish: "",
});
assert.equal(latestBlocked.ok, false);

const injection = validatePublishInputs({
  packageName: "@osva-ai/adapter-artifact-memory; rm -rf /",
  expectedVersion: "0.1.2",
  distTag: "rc",
  confirmLatest: "",
  confirmPublish: "",
});
assert.equal(injection.ok, false);

const badSemver = validatePublishInputs({
  packageName: "@osva-ai/runtime-cli-sidecar",
  expectedVersion: "not-a-version",
  distTag: "rc",
  confirmLatest: "",
  confirmPublish: "",
});
assert.equal(badSemver.ok, false);

assert.equal(PACKAGE_DIRS.size, 3);
for (const tag of ["rc", "latest", "next", "beta", "alpha"]) {
  assert.ok(ALLOWED_DIST_TAGS.has(tag));
}

console.log("publish-workflow-safety.test.mjs passed");
