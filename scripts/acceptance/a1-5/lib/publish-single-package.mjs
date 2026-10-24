#!/usr/bin/env node
/**
 * Prepublish verification for exactly one adapter (used by publish-package workflow).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectAdapterTarball, readPackedTarball } from "./pack-inspect.mjs";
import { runPackPipeline, verifyRegistrationExport } from "./pack-pipeline.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const PACKAGE_DIRS = {
  "@osva-ai/adapter-artifact-memory": path.join(
    REPO_ROOT,
    "packages",
    "artifact-memory",
  ),
  "@osva-ai/adapter-artifact-azure": path.join(
    REPO_ROOT,
    "packages",
    "artifact-azure",
  ),
};

/**
 * @param {string} packageName
 * @param {string} expectedVersion
 */
export async function verifySinglePackageForPublish(
  packageName,
  expectedVersion,
) {
  const packageDir = PACKAGE_DIRS[packageName];
  if (packageDir === undefined) {
    throw new Error(`Package not approved for publish: ${packageName}`);
  }

  const manifest = JSON.parse(
    await readFile(path.join(packageDir, "package.json"), "utf8"),
  );
  if (manifest.name !== packageName) {
    throw new Error(`Workspace name mismatch for ${packageName}`);
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `package.json version ${manifest.version} !== expected ${expectedVersion}`,
    );
  }

  const { tgz, packDir } = await runPackPipeline(packageName, packageDir);
  try {
    const inspect = await inspectAdapterTarball(packageName, tgz);
    if (!inspect.ok) {
      throw new Error(
        `Tarball inspect failed: ${inspect.errors?.join("; ") ?? "unknown"}`,
      );
    }

    const { manifest: packed } = await readPackedTarball(tgz);
    if (packed.version !== expectedVersion) {
      throw new Error(`Packed version ${String(packed.version)} mismatch`);
    }

    await verifyRegistrationExport(packageName, tgz);

    return { inspectFindings: inspect.findings ?? [] };
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(packDir, { force: true, recursive: true });
  }
}
