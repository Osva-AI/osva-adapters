#!/usr/bin/env node
/**
 * Validates GitHub Actions publish-package workflow inputs.
 * Used in CI and the publish workflow plan job (no shell interpolation of raw inputs).
 */
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** @type {ReadonlyMap<string, string>} */
export const PACKAGE_DIRS = new Map([
  ["@osva-ai/adapter-artifact-memory", "packages/artifact-memory"],
  ["@osva-ai/adapter-artifact-azure", "packages/artifact-azure"],
  ["@osva-ai/runtime-cli-sidecar", "packages/runtime-cli-sidecar"],
]);

export const ALLOWED_DIST_TAGS = new Set([
  "rc",
  "latest",
  "next",
  "beta",
  "alpha",
]);

const SEMVER_CORE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * @param {string} version
 */
export function isValidSemver(version) {
  return SEMVER_CORE.test(version);
}

/**
 * @param {{
 *   packageName: string;
 *   expectedVersion: string;
 *   distTag: string;
 *   confirmLatest: string;
 *   confirmPublish: string;
 * }} params
 */
export function validatePublishInputs(params) {
  const errors = [];
  const {
    packageName,
    expectedVersion,
    distTag,
    confirmLatest,
    confirmPublish,
  } = params;

  const packageDir = PACKAGE_DIRS.get(packageName);
  if (packageDir === undefined) {
    errors.push(`Package not approved for publish: ${packageName}`);
  }

  if (!isValidSemver(expectedVersion)) {
    errors.push(`Invalid semver expected_version: ${expectedVersion}`);
  }

  if (!ALLOWED_DIST_TAGS.has(distTag)) {
    errors.push(`Invalid dist_tag: ${distTag}`);
  }

  if (distTag === "latest" && confirmLatest !== "YES") {
    errors.push("dist-tag latest requires confirm_latest input YES.");
  }

  const realPublish = confirmPublish === "PUBLISH";
  if (confirmPublish.length > 0 && !realPublish) {
    errors.push(
      "confirm_real_publish must be empty (preflight) or exactly PUBLISH.",
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    packageDir,
    realPublish,
    preflightOnly: !realPublish,
  };
}

/**
 * @param {string} githubOutputPath
 * @param {Record<string, string>} outputs
 */
function writeGithubOutputs(githubOutputPath, outputs) {
  for (const [key, value] of Object.entries(outputs)) {
    const safe = value.replace(/\n/g, "");
    appendFileSync(githubOutputPath, `${key}=${safe}\n`);
  }
}

function parseArgs(argv) {
  let githubOutput;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--github-output" && argv[i + 1]) {
      githubOutput = argv[i + 1];
      i += 1;
    }
  }
  return { githubOutput };
}

async function main() {
  const { githubOutput } = parseArgs(process.argv.slice(2));
  const result = validatePublishInputs({
    packageName: process.env.INPUT_PACKAGE ?? "",
    expectedVersion: process.env.INPUT_EXPECTED_VERSION ?? "",
    distTag: process.env.INPUT_DIST_TAG ?? "",
    confirmLatest: process.env.INPUT_CONFIRM_LATEST ?? "",
    confirmPublish: process.env.INPUT_CONFIRM_REAL_PUBLISH ?? "",
  });

  if (!result.ok) {
    for (const err of result.errors ?? []) {
      console.error(err);
    }
    process.exit(1);
  }

  const manifestPath = path.join(REPO_ROOT, result.packageDir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.name !== process.env.INPUT_PACKAGE) {
    console.error("Workspace package.json name mismatch.");
    process.exit(1);
  }
  if (manifest.version !== process.env.INPUT_EXPECTED_VERSION) {
    console.error(
      `package.json version ${manifest.version} !== expected ${process.env.INPUT_EXPECTED_VERSION}`,
    );
    process.exit(1);
  }

  const summary = {
    package: process.env.INPUT_PACKAGE,
    expectedVersion: process.env.INPUT_EXPECTED_VERSION,
    distTag: process.env.INPUT_DIST_TAG,
    mode: result.realPublish ? "publish" : "preflight",
    packageDir: result.packageDir,
  };
  console.log(JSON.stringify(summary));

  if (githubOutput) {
    writeGithubOutputs(githubOutput, {
      package_dir: result.packageDir,
      real_publish: result.realPublish ? "true" : "false",
      preflight_only: result.preflightOnly ? "true" : "false",
    });
  }
}

const entry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
