#!/usr/bin/env node
/**
 * Prepublish verification for exactly one adapter (used by publish-package workflow).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectAdapterTarball, readPackedTarball } from "./pack-inspect.mjs";
import { runPackPipeline, verifyRegistrationExport } from "./pack-pipeline.mjs";

async function verifySidecarPackExports(tgzPath) {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const os = await import("node:os");
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "osva-a26-sidecar-"));
  try {
    await writeFile(
      path.join(workRoot, "package.json"),
      JSON.stringify({ name: "sidecar-reg-check", private: true, type: "module" }),
    );
    const { spawnSync } = await import("node:child_process");
    const install = spawnSync(
      "npm",
      ["install", "--no-save", tgzPath, "@osva-ai/contracts@1.1.0-rc.3", "@osva-ai/sdk@1.1.0-rc.3", "@osva-ai/runtime-protocol@1.1.0-rc.3"],
      { cwd: workRoot, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (install.status !== 0) {
      throw new Error("Sidecar pack install failed.");
    }
    const entryPath = path.join(
      workRoot,
      "node_modules",
      "@osva-ai",
      "runtime-cli-sidecar",
      "dist",
      "index.js",
    );
    const mod = await import(pathToFileURL(entryPath).href);
    for (const exportName of [
      "createCliSidecar",
      "createCliProviderFromSidecarConfig",
      "createGeminiCliProvider",
      "createCodexCliProvider",
      "createClaudeCliProvider",
    ]) {
      if (typeof mod[exportName] !== "function") {
        throw new Error(`Missing export ${exportName}`);
      }
    }
    const binPath = path.join(
      workRoot,
      "node_modules",
      "@osva-ai",
      "runtime-cli-sidecar",
      "dist",
      "bin",
      "start-sidecar.js",
    );
    const { access } = await import("node:fs/promises");
    await access(binPath);
  } finally {
    await rm(workRoot, { force: true, recursive: true });
  }
}

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
  "@osva-ai/runtime-cli-sidecar": path.join(
    REPO_ROOT,
    "packages",
    "runtime-cli-sidecar",
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

    if (packageName === "@osva-ai/runtime-cli-sidecar") {
      await verifySidecarPackExports(tgz);
    } else {
      await verifyRegistrationExport(packageName, tgz);
    }

    return { inspectFindings: inspect.findings ?? [] };
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(packDir, { force: true, recursive: true });
  }
}
